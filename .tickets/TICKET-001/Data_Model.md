# Data Model & Schema Design

## GunDB Graph Structure

### User Node
**Path**: `user~{userId}`

```typescript
{
  profile: {
    username: string,           // Public username
    encryptedProfile: string,  // Encrypted user profile data
    publicKey: string          // Public key for sharing encryption
  },
  documents: {
    // Reference to user's documents
    // Structure: doc~{docId} -> metadata reference
  },
  settings: {
    theme: 'light' | 'dark',
    editorSettings: {
      fontSize: number,
      wordWrap: boolean,
      // ... other editor preferences
    },
    openRouterApiKey: string   // Encrypted API key
  }
}
```

### Document Node
**Path**: `doc~{docId}`

```typescript
{
  metadata: {
    title: string,              // Document title (may be encrypted)
    createdAt: number,          // Unix timestamp
    updatedAt: number,          // Unix timestamp
    lastModifiedBy: string,     // userId (for last-write-wins)
    tags: string[]              // Array of tags
  },
  encryptedContent: string,    // AES-256-GCM encrypted markdown content
  contentIV: string,           // Initialization vector for encryption
  sharing: {
    owner: string,             // userId of document owner
    isPublic: boolean,         // Public access flag
    readAccess: string[],       // Array of userIds with read access
    writeAccess: string[],      // Array of userIds with write access
    shareToken: string,        // Token for public link sharing
    documentKey: {             // Encrypted document key for sharing
      [userId: string]: string // userId -> encrypted key
    }
  },
  branches: {
    // Only present for shared documents
    main: {
      encryptedContent: string,
      contentIV: string,
      mergedAt: number,
      version: number
    },
    // Branch nodes referenced here
    // branch~{userId}~{timestamp}
  }
}
```

### Branch Node (for shared documents)
**Path**: `branch~{userId}~{timestamp}`

```typescript
{
  encryptedContent: string,    // Proposed encrypted content
  contentIV: string,          // IV for branch content
  createdBy: string,          // userId of branch creator
  createdAt: number,          // Unix timestamp
  status: 'pending' | 'merged' | 'rejected',
  mergedAt?: number,          // Timestamp when merged (if merged)
  mergedBy?: string,          // userId who merged (if merged)
  parentVersion: number,      // Version of main branch when created
  description?: string        // Optional description of changes
}
```

### User-Document Relationship
**Path**: `user~{userId}/documents/{docId}`

```typescript
{
  docId: string,               // Reference to doc~{docId}
  accessLevel: 'owner' | 'write' | 'read',
  addedAt: number             // When user got access
}
```

## Data Flow

### Creating a Document

1. User creates new document
2. Generate unique `docId` (UUID or GunDB soul)
3. Encrypt content with user's derived key
4. Create `doc~{docId}` node with metadata and encrypted content
5. Add reference to `user~{userId}/documents/{docId}`
6. Set `sharing.owner` to current userId

### Editing a Document (Single User)

1. User edits document
2. Encrypt new content
3. Update `doc~{docId}/encryptedContent`
4. Update `metadata.updatedAt` and `metadata.lastModifiedBy`
5. GunDB syncs to other devices (last-write-wins)

### Editing a Shared Document (Multiple Contributors)

1. Collaborator edits document
2. Create branch: `branch~{userId}~{timestamp}`
3. Encrypt proposed changes
4. Set branch status to 'pending'
5. Add branch reference to `doc~{docId}/branches`
6. Owner is notified of pending branch

### Merging a Branch

1. Owner reviews branch
2. Owner decides to merge
3. Copy branch content to `doc~{docId}/branches/main`
4. Update branch status to 'merged'
5. Update `metadata.updatedAt`
6. Increment version number
7. Sync to all collaborators

### Sharing a Document

1. Owner grants access to user
2. Generate document-specific encryption key
3. Encrypt document key with recipient's public key
4. Store encrypted key in `sharing.documentKey[userId]`
5. Add userId to `sharing.readAccess` or `sharing.writeAccess`
6. Create reference in `user~{recipientId}/documents/{docId}`

## Encryption Schema

### User Authentication (SEA)

```typescript
// User creation with SEA
const user = await gun.user().create(username, password);
// SEA automatically generates ECDSA key pair

// User authentication with SEA
await gun.user().auth(username, password);
// SEA handles key derivation and authentication
```

### Document Encryption (SEA - Standard)

```typescript
// For user's own documents - use SEA automatically
const doc = gun.user().get('documents').get(docId);
doc.put({
  title: "My Document",
  content: "Document content..." // Automatically encrypted by SEA
});

// Automatically decrypted when reading
doc.on((data) => {
  // data.content is automatically decrypted
});
```

### Shared Document Encryption (Hybrid: Document Keys + SEA ECDH)

```typescript
// Generate document-specific key (for branching model)
const docKey = generateRandomKey(); // 256-bit random key

// Encrypt document with document key (manual AES-256-GCM)
const encrypted = AES_GCM_encrypt(documentContent, docKey, iv);

// Encrypt docKey for each collaborator using SEA's ECDH
const encryptedKey = await SEA.encrypt(docKey, collaboratorPub);

// Store in sharing.documentKey[userId]
```

## Query Patterns

### Get User's Documents

```javascript
gun.get(`user~${userId}`).get('documents').map((docRef) => {
  return gun.get(docRef).get('metadata');
});
```

### Get Document Content

```javascript
gun.get(`doc~${docId}`).get('encryptedContent').once((encrypted) => {
  // Decrypt with user's key
  const decrypted = decrypt(encrypted, userKey);
});
```

### Get Pending Branches

```javascript
gun.get(`doc~${docId}`).get('branches').map((branchRef) => {
  return gun.get(branchRef).once((branch) => {
    if (branch.status === 'pending') {
      return branch;
    }
  });
});
```

### Check Document Access

```javascript
gun.get(`doc~${docId}`).get('sharing').once((sharing) => {
  const hasAccess =
    sharing.owner === userId ||
    sharing.readAccess.includes(userId) ||
    sharing.writeAccess.includes(userId) ||
    sharing.isPublic;
});
```

## Indexing Strategy

### Document List Index

Store lightweight document references in user node for fast listing:

```typescript
user~{userId}/documentIndex: {
  [docId: string]: {
    title: string,        // May be encrypted
    updatedAt: number,
    tags: string[]
  }
}
```

### Search Index (Future)

For client-side search:
- Index document titles and tags
- Store in IndexedDB for fast queries
- Update on document changes

## Migration & Versioning

### Document Versioning

```typescript
doc~{docId}/branches/main: {
  version: number,        // Increment on each merge
  history: {
    [version: number]: {
      encryptedContent: string,
      mergedAt: number,
      mergedBy: string
    }
  }
}
```

### Schema Migration

- Use version numbers in node structure
- Migrate data when schema changes
- Maintain backward compatibility

## Constraints & Validation

### Document Constraints

- Maximum document size: 10MB (before encryption)
- Maximum branches per document: 50 (to prevent bloat)
- Branch expiration: Auto-reject after 30 days if not merged

### Access Control

- Only owner can merge branches
- Only users with writeAccess can create branches
- ReadAccess users can view but not edit
- Public documents require shareToken for access

### Data Integrity

- Validate encryption before storing
- Check permissions before operations
- Verify branch parent version before merge
- Handle concurrent merge attempts
