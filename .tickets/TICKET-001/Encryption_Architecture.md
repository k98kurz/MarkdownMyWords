# Encryption Architecture

## Overview

MarkdownMyWords uses GunDB's SEA (Security, Encryption, Authorization) as the primary encryption system for end-to-end encryption. SEA provides automatic encryption/decryption, ECDH-based key exchange for sharing, and integrated authentication. Manual PBKDF2/AES-256-GCM is only used as a fallback where SEA cannot support specific features.

## Primary: GunDB SEA

### What is SEA?

SEA (Security, Encryption, Authorization) is GunDB's built-in encryption module that provides:
- **ECDSA key pairs** for user identity
- **ECDH key exchange** for secure sharing (derives shared secrets)
- **Automatic encryption/decryption** of data stored in GunDB
- **Integrated authentication** with GunDB user system
- **Certificate-based access control** for permissions

### SEA Usage

#### User Authentication
```typescript
// User creates account with password
const user = await gun.user().create(username, password);

// User authenticates
await gun.user().auth(username, password);

// SEA automatically handles key pair generation and management
```

#### Document Encryption (SEA)
```typescript
// SEA automatically encrypts data when storing
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

#### Sharing with SEA (ECDH)
```typescript
// Share document with another user using SEA
// SEA uses ECDH to derive shared secret
const recipient = gun.user(recipientPubKey);
const shared = gun.user().get('documents').get(docId);

// SEA handles encryption with recipient's public key via ECDH
shared.get('content').put(encryptedContent, null, {opt: {sea: recipient}});
```

**How it works:**
1. SEA derives shared secret using ECDH: `ECDH(sender_private_key, recipient_public_key)`
2. Uses shared secret (or key derived from it) to encrypt data
3. Recipient derives same secret: `ECDH(recipient_private_key, sender_public_key)`
4. Recipient decrypts automatically

### SEA Advantages

- ✅ **Automatic encryption/decryption** - No manual encryption code needed
- ✅ **ECDH key exchange** - Efficient, secure sharing
- ✅ **Integrated with GunDB** - Works seamlessly with graph database
- ✅ **Built-in authentication** - User identity management
- ✅ **Certificate system** - Access control built-in
- ✅ **Less code** - Reduced implementation complexity
- ✅ **Well-tested** - Battle-tested encryption implementation

## Fallback: Manual Encryption

Manual PBKDF2/AES-256-GCM is used only where SEA cannot support specific features:

### Use Case 1: Document-Specific Keys for Branching

**Problem**: SEA encrypts per-user, but we need document-specific keys that can be shared with multiple collaborators for the branching model.

**Solution**: Generate document-specific keys and encrypt them using SEA's ECDH for each collaborator.

```typescript
// Generate document-specific key (for branching model)
const docKey = generateRandomKey(); // 256-bit random key

// Encrypt document with document key (manual AES-256-GCM)
const encrypted = await encryptDocument(content, docKey);

// Encrypt document key for each collaborator using SEA's ECDH
for (const collaborator of collaborators) {
  // Use SEA to encrypt the document key
  const encryptedKey = await SEA.encrypt(docKey, collaborator.pub);
  store(`doc~{docId}/sharing/documentKey/${collaborator.userId}`, encryptedKey);
}
```

### Use Case 2: OpenRouter API Key Storage

**Problem**: Need to encrypt user's OpenRouter API key with their user key.

**Solution**: Use SEA to encrypt the API key (or manual encryption if needed for specific format).

```typescript
// Encrypt API key with user's SEA key
const encryptedApiKey = await SEA.encrypt(apiKey, user.pub);
gun.user().get('settings').get('openRouterApiKey').put(encryptedApiKey);
```

## Encryption Modes

### Mode 1: User's Own Documents (SEA)

```typescript
// Use SEA for automatic encryption
const doc = gun.user().get('documents').get(docId);
doc.put({
  title: "My Document",
  content: "Document content..." // Automatically encrypted by SEA
});
```

**Characteristics**:
- Automatic encryption/decryption via SEA
- User's SEA key pair used
- Fast and simple
- Integrated with GunDB

### Mode 2: Shared Documents (Hybrid: SEA + Manual)

```typescript
// Generate document-specific key for branching model
const docKey = generateRandomKey();

// Encrypt document with document key (manual AES-256-GCM)
const encrypted = await encryptDocument(content, docKey);

// Encrypt document key for each collaborator using SEA's ECDH
for (const collaborator of collaborators) {
  const encryptedKey = await SEA.encrypt(docKey, collaborator.pub);
  store(`doc~{docId}/sharing/documentKey/${collaborator.userId}`, encryptedKey);
}
```

**Characteristics**:
- Document-specific key (enables branching model)
- Key encrypted with SEA's ECDH for each collaborator
- Owner can revoke access by removing encrypted key
- Combines SEA's sharing with custom document keys

## Key Management

### User Keys (SEA)

**Lifecycle**:
1. User creates account with password
2. SEA generates ECDSA key pair
3. Key pair managed by SEA automatically
4. User authenticates with password
5. SEA handles all encryption/decryption

**Storage**: Managed by SEA, private key encrypted with password

### Document Keys (for Shared Documents with Branching)

**Lifecycle**:
1. Generate random 256-bit key when sharing document
2. Encrypt document with document key (manual AES-256-GCM)
3. Encrypt document key with each collaborator's public key using SEA's ECDH
4. Store encrypted keys in `sharing.documentKey[userId]`
5. Collaborator decrypts their copy of document key using SEA
6. Use document key to decrypt document

**Storage**: Encrypted in GunDB using SEA

## Encryption Service API

### Service Interface

```typescript
interface EncryptionService {
  // SEA operations (primary)
  initializeSEA(): Promise<void>;
  createUser(username: string, password: string): Promise<User>;
  authenticateUser(username: string, password: string): Promise<User>;

  // Document operations (SEA)
  encryptWithSEA(data: any, recipientPub?: string): Promise<string>;
  decryptWithSEA(encrypted: string): Promise<any>;

  // Manual encryption (fallback only)
  encryptDocument(content: string, key: CryptoKey): Promise<EncryptedDocument>;
  decryptDocument(encrypted: EncryptedDocument, key: CryptoKey): Promise<string>;
  generateDocumentKey(): Promise<CryptoKey>;

  // Hybrid: Document key encryption with SEA
  encryptDocumentKeyWithSEA(docKey: CryptoKey, recipientPub: string): Promise<string>;
  decryptDocumentKeyWithSEA(encryptedKey: string): Promise<CryptoKey>;
}
```

## When to Use Manual Encryption

Manual PBKDF2/AES-256-GCM should **only** be used when:

1. **Document-specific keys needed**: For the branching model, we need keys that can be shared with multiple users but are document-specific
2. **Specific format requirements**: If a specific encryption format is required that SEA doesn't support
3. **Performance optimization**: If manual encryption provides better performance for specific use cases

**Default**: Always use SEA unless there's a specific requirement that SEA cannot meet.

## Security Best Practices

### 1. Prefer SEA
- Use SEA for all standard encryption needs
- Leverage SEA's built-in security features
- Trust SEA's battle-tested implementation

### 2. Manual Encryption (When Needed)
- Only use when SEA cannot support the feature
- Use AES-256-GCM for authenticated encryption
- Use strong random values for keys and IVs

### 3. Key Management
- Let SEA manage user keys
- Store document keys encrypted with SEA
- Never store plaintext keys

### 4. Error Handling
- Handle SEA errors gracefully
- Never expose encryption errors to user
- Log errors securely

## Implementation Checklist

- [ ] SEA integration and initialization
- [ ] User creation with SEA
- [ ] User authentication with SEA
- [ ] Document encryption with SEA (standard case)
- [ ] Document sharing with SEA's ECDH
- [ ] Document-specific key generation (for branching)
- [ ] Manual AES-256-GCM encryption (for document keys)
- [ ] Document key encryption with SEA (hybrid approach)
- [ ] Error handling for SEA operations
- [ ] Fallback to manual encryption where needed
- [ ] Integration with GunDB storage
