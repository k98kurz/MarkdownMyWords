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
  // ack.ok: int (0 is success) | undefined
  // ack.err: string | undefined
});
```

#### Authenticate User
```typescript
gun.user().auth(username, password, (ack) => {
  // ack.ok: int (0 is success) | undefined
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

### Sharing Operations

#### Share Document
```typescript
// Add to access list
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('readAccess').set([...readAccess, userId]);
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('writeAccess').set([...writeAccess, userId]);

// Store encrypted document key
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('documentKey').get(userId).put(encryptedKey);

// Create reference for collaborator
gun.get(`${appNamespace}~user~${userId}`).get('documents').get(docId).put({
  docId: docId,
  accessLevel: 'read' | 'write',
  addedAt: Date.now()
});
```

#### Revoke Access
```typescript
// Remove from access lists
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('readAccess').unset(userId);
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('writeAccess').unset(userId);

// Remove encrypted key
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('documentKey').get(userId).put(null);

// Remove reference
gun.get(`${appNamespace}~user~${userId}`).get('documents').get(docId).put(null);
```

#### Generate Share Token
```typescript
const token = generateSecureToken();
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('shareToken').put(token);
gun.get(`${appNamespace}~doc~${docId}`).get('sharing').get('isPublic').put(true);
```

## Service API Contracts

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
- SEA (Security, Encryption, Authorization)
- User identity for P2P sync
