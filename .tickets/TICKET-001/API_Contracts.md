# API Contracts

## OpenRouter API

### Base URL
```
https://openrouter.ai/api/v1
```

### Authentication
```
Authorization: Bearer {api_key}
HTTP-Referer: {origin}
X-Title: MarkdownMyWords
```

## Ollama API

### Base URL
```
http://localhost:11434
```
(Configurable by user)

### Authentication
None required (local server)

### Chat Completions

**Endpoint**: `POST /api/chat`

**Request**:
```typescript
interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
}
```

**Response**:
```typescript
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}
```

### Models List

**Endpoint**: `GET /api/tags`

**Response**:
```typescript
interface OllamaModelsResponse {
  models: Array<{
    name: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model: string;
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}
```

### Chat Completions

**Endpoint**: `POST /chat/completions`

**Request**:
```typescript
interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;        // 0-2, default 1
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;  // -2 to 2
  presence_penalty?: number;   // -2 to 2
}
```

**Response**:
```typescript
interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

**Error Response**:
```typescript
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}
```

### Models List

**Endpoint**: `GET /models`

**Response**:
```typescript
interface ModelsResponse {
  data: Array<{
    id: string;
    name: string;
    description?: string;
    pricing: {
      prompt: string;
      completion: string;
    };
  }>;
}
```

## GunDB Operations

### Initialize Client

```typescript
const gun = Gun({
  peers: ['wss://relay.markdownmywords.com/gun'],
  localStorage: true,
  radisk: true
});
```

### User Operations

#### Create User
```typescript
gun.user().create(username, password, (ack) => {
  // ack.ok: boolean
  // ack.err: string | undefined
});
```

#### Authenticate User
```typescript
gun.user().auth(username, password, (ack) => {
  // ack.ok: boolean
  // ack.err: string | undefined
  // ack.user: User | undefined
});
```

#### Get User Profile
```typescript
gun.user().get('profile').once((profile) => {
  // profile: { username, encryptedProfile, publicKey }
});
```

### Document Operations

#### Create Document
```typescript
const docRef = gun.get(`doc~${docId}`);
docRef.put({
  metadata: {
    title: string,
    createdAt: number,
    updatedAt: number,
    lastModifiedBy: string,
    tags: string[]
  },
  encryptedContent: string,
  contentIV: string,
  sharing: {
    owner: string,
    isPublic: boolean,
    readAccess: string[],
    writeAccess: string[],
    shareToken: string | null
  }
});
```

#### Read Document
```typescript
gun.get(`doc~${docId}`).once((doc) => {
  // doc: Document
});
```

#### Update Document
```typescript
gun.get(`doc~${docId}`).get('encryptedContent').put(encryptedContent);
gun.get(`doc~${docId}`).get('metadata').get('updatedAt').put(Date.now());
gun.get(`doc~${docId}`).get('metadata').get('lastModifiedBy').put(userId);
```

#### Delete Document
```typescript
gun.get(`doc~${docId}`).put(null);
gun.get(`user~${userId}`).get('documents').get(docId).put(null);
```

#### Subscribe to Document Changes
```typescript
gun.get(`doc~${docId}`).on((doc) => {
  // Called whenever document changes
});
```

### Branch Operations

#### Create Branch
```typescript
const branchId = `branch~${userId}~${Date.now()}`;
gun.get(branchId).put({
  encryptedContent: string,
  contentIV: string,
  createdBy: string,
  createdAt: number,
  status: 'pending',
  parentVersion: number,
  description: string | null
});

// Add to document's branches
gun.get(`doc~${docId}`).get('branches').get(branchId).put(true);
```

#### List Branches
```typescript
gun.get(`doc~${docId}`).get('branches').map((branchId) => {
  gun.get(branchId).once((branch) => {
    if (branch.status === 'pending') {
      // Handle pending branch
    }
  });
});
```

#### Merge Branch
```typescript
// Update main document
gun.get(`doc~${docId}`).get('branches').get('main').put({
  encryptedContent: branch.encryptedContent,
  contentIV: branch.contentIV,
  mergedAt: Date.now(),
  version: currentVersion + 1
});

// Update branch status
gun.get(branchId).get('status').put('merged');
gun.get(branchId).get('mergedAt').put(Date.now());
gun.get(branchId).get('mergedBy').put(userId);
```

#### Reject Branch
```typescript
gun.get(branchId).get('status').put('rejected');
gun.get(branchId).get('rejectedAt').put(Date.now());
gun.get(branchId).get('rejectedBy').put(userId);
gun.get(branchId).get('reason').put(reason);
```

### Sharing Operations

#### Share Document
```typescript
// Add to access list
gun.get(`doc~${docId}`).get('sharing').get('readAccess').set([...readAccess, userId]);
gun.get(`doc~${docId}`).get('sharing').get('writeAccess').set([...writeAccess, userId]);

// Store encrypted document key
gun.get(`doc~${docId}`).get('sharing').get('documentKey').get(userId).put(encryptedKey);

// Create reference for collaborator
gun.get(`user~${userId}`).get('documents').get(docId).put({
  docId: docId,
  accessLevel: 'read' | 'write',
  addedAt: Date.now()
});
```

#### Revoke Access
```typescript
// Remove from access lists
gun.get(`doc~${docId}`).get('sharing').get('readAccess').unset(userId);
gun.get(`doc~${docId}`).get('sharing').get('writeAccess').unset(userId);

// Remove encrypted key
gun.get(`doc~${docId}`).get('sharing').get('documentKey').get(userId).put(null);

// Remove reference
gun.get(`user~${userId}`).get('documents').get(docId).put(null);
```

#### Generate Share Token
```typescript
const token = generateSecureToken();
gun.get(`doc~${docId}`).get('sharing').get('shareToken').put(token);
gun.get(`doc~${docId}`).get('sharing').get('isPublic').put(true);
```

## Service API Contracts

### Encryption Service

```typescript
interface EncryptionService {
  // SEA operations (primary)
  initializeSEA(): Promise<void>;
  createUser(username: string, password: string): Promise<User>;
  authenticateUser(username: string, password: string): Promise<User>;

  // Document operations (SEA)
  encryptWithSEA(data: any, recipientPub?: string): Promise<string>;
  decryptWithSEA(encrypted: string): Promise<any>;

  // Manual encryption (fallback only - for document-specific keys)
  encryptDocument(content: string, key: CryptoKey): Promise<EncryptedDocument>;
  decryptDocument(encrypted: EncryptedDocument, key: CryptoKey): Promise<string>;
  generateDocumentKey(): Promise<CryptoKey>;

  // Hybrid: Document key encryption with SEA
  encryptDocumentKeyWithSEA(docKey: CryptoKey, recipientPub: string): Promise<string>;
  decryptDocumentKeyWithSEA(encryptedKey: string): Promise<CryptoKey>;
}
```

### Gun Service

```typescript
interface GunService {
  // Initialization
  initialize(relayUrl: string): void;
  initializeSEA(): Promise<void>;

  // User operations (SEA)
  createUser(username: string, password: string): Promise<User>;
  authenticate(username: string, password: string): Promise<User>;
  getCurrentUser(): Promise<User | null>;
  logout(): void;

  // Document operations
  createDocument(title: string, content: string): Promise<string>;
  getDocument(docId: string): Promise<Document | null>;
  updateDocument(docId: string, content: string): Promise<void>;
  deleteDocument(docId: string): Promise<void>;
  listDocuments(userId: string): Promise<Document[]>;
  subscribeToDocument(docId: string, callback: (doc: Document) => void): () => void;

  // Branch operations
  createBranch(docId: string, content: string, description?: string): Promise<string>;
  getBranches(docId: string): Promise<Branch[]>;
  mergeBranch(docId: string, branchId: string): Promise<void>;
  rejectBranch(branchId: string, reason?: string): Promise<void>;

  // Sharing operations
  shareDocument(docId: string, userId: string, accessLevel: 'read' | 'write'): Promise<void>;
  revokeAccess(docId: string, userId: string): Promise<void>;
  generateShareToken(docId: string): Promise<string>;
  getDocumentByToken(token: string): Promise<string | null>;
}
```

### LLM Service

```typescript
type LLMProvider = 'openrouter' | 'ollama';

interface LLMConfig {
  provider: LLMProvider;
  // OpenRouter config
  openRouterApiKey?: string;
  // Ollama config
  ollamaBaseUrl?: string; // Default: http://localhost:11434
  ollamaModel?: string;   // User's installed model
}

interface LLMService {
  // Provider management
  setProvider(provider: LLMProvider): void;
  getProvider(): LLMProvider;
  validateConnection(): Promise<boolean>;

  // Review document
  reviewDocument(content: string, options?: ReviewOptions): Promise<ReviewResult>;

  // Revise document
  reviseDocument(content: string, instructions: string): Promise<string>;

  // Suggest content
  suggestContent(context: string, prompt: string): Promise<string[]>;

  // Cost estimation (OpenRouter only)
  estimateCost(model: string, promptTokens: number, completionTokens: number): Promise<number>;

  // Usage tracking (OpenRouter only)
  trackUsage(model: string, usage: TokenUsage): void;
  getUsageStats(): UsageStats;

  // Model discovery (Ollama only)
  getAvailableModels(): Promise<string[]>;
}
```

### Branch Service

```typescript
interface BranchService {
  createBranch(docId: string, content: string, description?: string): Promise<Branch>;
  getBranches(docId: string, status?: BranchStatus): Promise<Branch[]>;
  getBranch(branchId: string): Promise<Branch | null>;
  mergeBranch(docId: string, branchId: string): Promise<void>;
  rejectBranch(branchId: string, reason?: string): Promise<void>;
  getBranchDiff(docId: string, branchId: string): Promise<Diff>;
}
```

### Sync Service

```typescript
interface SyncService {
  // Conflict resolution
  resolveConflict(docId: string, localContent: string, remoteContent: string): Promise<string>;

  // Sync operations
  syncDocument(docId: string): Promise<void>;
  syncAllDocuments(): Promise<void>;

  // Offline queue
  queueOperation(operation: SyncOperation): void;
  processQueue(): Promise<void>;
}
```

## Error Handling

### Error Types

```typescript
interface AppError {
  code: string;
  message: string;
  details?: any;
}

// Common error codes
enum ErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  RATE_LIMIT = 'RATE_LIMIT',
  API_ERROR = 'API_ERROR'
}
```

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: number;
  };
}
```

## Rate Limiting

### OpenRouter API

- **Free Tier**: Varies by model
- **Rate Limits**: Per API key
- **Handling**: Retry with exponential backoff

### Ollama API

- **No Rate Limits**: Local inference
- **Hardware Limits**: Limited by local resources
- **Handling**: Queue requests if needed, show progress

### GunDB

- **No Rate Limits**: P2P sync
- **Relay Server**: 100k requests/day (free tier)

## Versioning

### API Versioning

- **OpenRouter**: `/api/v1` (versioned)
- **GunDB**: No versioning (protocol-based)
- **Internal APIs**: No versioning (monolithic)

### Data Versioning

- **Documents**: Version field in branches/main
- **Schema**: Version field in nodes (future)

## Authentication

### OpenRouter

- API key in Authorization header
- Key stored encrypted in GunDB
- Decrypted on use

### Ollama

- No authentication required (local server)
- Connection validation via health check
- CORS configuration if needed for cross-origin access

### GunDB

- Username/password authentication
- SEA (Security, Encryption, Authorization) optional
- User identity for P2P sync
