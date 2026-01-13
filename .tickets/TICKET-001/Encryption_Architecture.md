# Encryption Architecture

## Overview

MarkdownMyWords uses GunDB SEA (Security, Encryption, Authorization) for all encryption operations:
- **Document encryption**: SEA symmetric encryption via `SEA.encrypt()`/`SEA.decrypt()` with per-document symmetric keys (256-bit keys generated via Web Crypto API, exported as base64)
- **Key sharing**: SEA's ECDH via `SEA.secret()` to derive shared secrets, then `SEA.encrypt()` to encrypt document keys for sharing
- **User data storage**: GunDB's/SEA's automatic encryption for non-document user data (settings, profile, etc.) via `gun.user().get().put()`
- **Authentication**: SEA for user authentication and key management

All documents are encrypted with per-document symmetric keys to enable:
- URL-based sharing (key in URL parameter)
- Multi-branch collaboration (all branches use the same key)
- Secure key sharing between authenticated users via SEA's ECDH

Non-document user data (settings, profile, preferences) uses GunDB's automatic encryption via `gun.user().get().put()`, which SEA handles automatically.

## Primary: GunDB SEA

### What is SEA?

SEA (Security, Encryption, Authorization) is GunDB's built-in encryption module that provides:
- **ECDSA key pairs** for user identity
- **ECDH key exchange** for secure sharing (derives shared secrets via `SEA.secret()`)
- **Symmetric encryption** via `SEA.encrypt()`/`SEA.decrypt()` for document encryption
- **Automatic encryption/decryption** of user data stored via `gun.user().get().put()`
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

#### User Data Storage (Automatic Encryption)
```typescript
// Non-document user data uses SEA's automatic encryption
// Store user settings, profile, preferences, etc.
gun.user().get('settings').get('openRouterApiKey').put(apiKey);
gun.user().get('profile').get('displayName').put('John Doe');
gun.user().get('preferences').get('theme').put('dark');

// SEA automatically encrypts/decrypts this data
// Reading is automatic - no manual decryption needed
gun.user().get('settings').get('openRouterApiKey').once((apiKey) => {
  // apiKey is automatically decrypted by SEA
});
```

**Characteristics**:
- Automatic encryption/decryption via SEA
- User's SEA key pair used
- Fast and simple
- Integrated with GunDB
- No manual encryption code needed

#### Document Encryption (SEA Symmetric Encryption)
```typescript
// All documents use per-document symmetric keys with SEA
const docKey = await encryptionService.generateDocumentKey(); // 256-bit random key, exported as base64 string
const encrypted = await encryptionService.encryptDocument(content, docKey); // Uses SEA.encrypt()

// Store encrypted document in GunDB
gun.get(`documents/${docId}`).put({
  encryptedContent: encrypted // SEA-encrypted string
});

// Decrypt when reading
const encrypted = await gun.get(`documents/${docId}`).once();
const decrypted = await encryptionService.decryptDocument(encrypted.encryptedContent, docKey); // Uses SEA.decrypt()
```

#### Sharing Document Keys with SEA (ECDH)
```typescript
// Share document key with another user using SEA's ECDH
// Documents themselves are NOT shared via SEA - only the keys are

// Get user's ephemeral key pair (from authenticated user)
const user = gun.user();
const userIs = user.is; // Contains epriv and epub

// Derive shared secret using ECDH
const sharedSecret = await SEA.secret({ epub: recipientEpub }, {
  epriv: userIs.epriv,
  epub: userIs.epub
});

// Encrypt document key with shared secret
const encryptedKey = await SEA.encrypt(keyBase64, sharedSecret);

// Store encrypted key for recipient
gun.get(`documents/${docId}/sharing/documentKey/${recipientUserId}`).put({
  encryptedKey: encryptedKey,
  ephemeralPub: userIs.epub // Recipient needs this to derive shared secret
});
```

**How it works:**
1. Sender uses their ephemeral key pair (from `user.is`) and recipient's ephemeral public key
2. SEA derives shared secret using ECDH: `ECDH(sender_epriv, recipient_epub)`
3. Document key is encrypted with the shared secret
4. Recipient derives same secret: `ECDH(recipient_epriv, sender_epub)`
5. Recipient decrypts document key, then uses it to decrypt the document

### SEA Advantages

- ✅ **Symmetric encryption** - `SEA.encrypt()`/`SEA.decrypt()` for document encryption
- ✅ **ECDH key exchange** - Efficient, secure sharing via `SEA.secret()`
- ✅ **Automatic encryption/decryption** - For user data via `gun.user().get().put()`
- ✅ **Integrated with GunDB** - Works seamlessly with graph database
- ✅ **Built-in authentication** - User identity management
- ✅ **Certificate system** - Access control built-in
- ✅ **Less code** - Reduced implementation complexity
- ✅ **Well-tested** - Battle-tested encryption implementation

## Document Encryption with SEA

All documents use SEA symmetric encryption with per-document keys:

### Document-Specific Keys for Branching

**Problem**: Need document-specific keys that can be shared with multiple collaborators for the branching model.

**Solution**: Generate document-specific keys and encrypt documents using `SEA.encrypt()`, then share keys using SEA's ECDH.

```typescript
// Generate document-specific key (for branching model)
const docKey = await encryptionService.generateDocumentKey(); // 256-bit random key, exported as base64 string

// Encrypt document with document key using SEA
const encrypted = await encryptionService.encryptDocument(content, docKey); // Uses SEA.encrypt()

// Encrypt document key for each collaborator using SEA's ECDH
const user = gun.user();
const userPair = await encryptionService.getStoredEphemeralKeys(); // Get sender's ephemeral key pair

for (const collaborator of collaborators) {
  // Derive shared secret using ECDH (NOT direct encryption with public key!)
  const sharedSecret = await SEA.secret({ epub: collaborator.epub }, userPair);

  // Encrypt document key with shared secret
  const encryptedKey = await SEA.encrypt(docKey, sharedSecret);

  // Store encrypted key with sender's ephemeral public key
  store(`${appNamespace}~doc~{docId}/sharing/documentKey/${collaborator.userId}`, {
    encryptedKey: encryptedKey,
    ephemeralPub: userPair.epub
  });
}
```

### Use Case 2: OpenRouter API Key Storage

**Problem**: Need to encrypt user's OpenRouter API key with their user key.

**Solution**: Use GunDB's automatic encryption via `gun.user().get().put()` which SEA handles automatically, or use SEA's passphrase encryption if a specific format is needed.

```typescript
// Option 1: Use GunDB's automatic encryption (recommended)
gun.user().get('settings').get('openRouterApiKey').put(apiKey);
// SEA automatically encrypts this with the user's key

// Option 2: Manual encryption with passphrase (if needed for specific format)
const encryptedApiKey = await SEA.encrypt(apiKey, passphrase);
gun.user().get('settings').get('openRouterApiKey').put(encryptedApiKey);
```

## Encryption Approach

**All documents use the same encryption approach**: SEA symmetric encryption (`SEA.encrypt()`/`SEA.decrypt()`) with per-document symmetric keys. This enables URL-based sharing and multi-branch collaboration.

### Document Encryption (All Documents)

```typescript
// Generate document-specific key for branching model
const docKey = await encryptionService.generateDocumentKey(); // 256-bit key, exported as base64 string

// Encrypt document with document key using SEA
const encrypted = await encryptionService.encryptDocument(content, docKey); // Uses SEA.encrypt()

// Encrypt document key for each collaborator using SEA's ECDH
const user = gun.user();
const userPair = await encryptionService.getStoredEphemeralKeys(); // Get sender's ephemeral key pair

for (const collaborator of collaborators) {
  // Derive shared secret using ECDH
  const sharedSecret = await SEA.secret({ epub: collaborator.epub }, userPair);

  // Encrypt document key with shared secret
  const encryptedKey = await SEA.encrypt(docKey, sharedSecret);

  // Store encrypted key with sender's ephemeral public key
  store(`${appNamespace}~doc~{docId}/sharing/documentKey/${collaborator.userId}`, {
    encryptedKey: encryptedKey,
    ephemeralPub: userPair.epub
  });
}
```

**Characteristics**:
- Document-specific key (enables branching model)
- Documents encrypted with `SEA.encrypt()` using document key
- Document keys encrypted with SEA's ECDH for each collaborator
- Owner can revoke access by removing encrypted key
- Uses SEA for both document encryption and key sharing

## Key Management

### User Keys (SEA)

**Lifecycle**:
1. User creates account with password
2. SEA generates ECDSA key pair
3. Key pair managed by SEA automatically
4. User authenticates with password
5. SEA handles all encryption/decryption

**Storage**: Managed by SEA, private key encrypted with password

### Document Keys (All Documents)

**Lifecycle**:
1. Generate random 256-bit key when creating document (via Web Crypto API)
2. Export key as base64 string for use with SEA
3. Encrypt document with document key using `SEA.encrypt()`
4. For sharing: Encrypt document key with each collaborator using SEA's ECDH
   - Derive shared secret: `SEA.secret({ epub: recipientEpub }, senderPair)`
   - Encrypt key: `SEA.encrypt(keyBase64, sharedSecret)`
5. Store encrypted keys in `sharing.documentKey[userId]` with sender's ephemeral public key
6. Collaborator derives shared secret and decrypts their copy of document key using `SEA.decrypt()`
7. Use document key to decrypt document using `SEA.decrypt()`

**Storage**: Encrypted in GunDB using SEA's ECDH (for shared documents) or exported to base64 (for URL sharing)

## Encryption Service API

### Service Interface

```typescript
interface EncryptionService {
  // SEA initialization (for encryption and key sharing)
  initializeSEA(): Promise<void>;

  // Document encryption (SEA symmetric encryption with per-document keys)
  generateDocumentKey(): Promise<string>; // Returns base64 string
  encryptDocument(content: string, key: string): Promise<string | undefined>; // Uses SEA.encrypt()
  decryptDocument(encrypted: string, key: string): Promise<string | undefined>; // Uses SEA.decrypt()

  // Key sharing (SEA's ECDH)
  encryptDocumentKeyWithSEA(docKey: string, recipientEpub: string): Promise<{ encryptedKey: string; ephemeralPub: string }>;
  decryptDocumentKeyWithSEA(encryptedKey: string, senderEpub: string): Promise<string | undefined>;

  // Key serialization (for URL parameters)
  exportKey(key: CryptoKey): Promise<string>; // Internal: converts CryptoKey to base64
  retrieveDocumentKey(docId: string): Promise<string | undefined>; // Retrieves and decrypts document key
}

// NOTE: User authentication (createSEAUser, authenticateSEAUser) is in gunService, not encryptionService
```

## Why SEA Encryption for Documents

All documents use SEA symmetric encryption (`SEA.encrypt()`/`SEA.decrypt()`) with per-document symmetric keys because:

1. **Document-specific keys**: Enables all branches of a document to use the same key (required for multi-branch collaboration)
2. **URL-based sharing**: Keys can be exported to base64 and included in URL parameters
3. **Key sharing flexibility**: Same key can be shared via ECDH (authenticated users) or URL (unauthenticated sharing)
4. **Consistent approach**: All documents use the same encryption method, whether shared or not
5. **SEA integration**: Uses the same encryption library for documents and key sharing, reducing complexity

**SEA is used for**:
- Document encryption via `SEA.encrypt()`/`SEA.decrypt()` with per-document keys
- User authentication
- Sharing document keys between authenticated users via ECDH (`SEA.secret()` + `SEA.encrypt()`)
- Automatic encryption of non-document user data (settings, profile, preferences) via `gun.user().get().put()`

**Documents are encrypted with SEA** - using `SEA.encrypt()`/`SEA.decrypt()` with per-document keys to enable URL sharing and multi-branch collaboration.

## Security Best Practices

### 1. Use SEA for Key Sharing and User Data
- Use SEA's ECDH (`sea.secret()` + `sea.encrypt()`) for sharing document keys
- Use user's existing ephemeral key pair from `user.is`, don't generate new ephemeral pairs
- Use `gun.user().get().put()` for non-document user data (settings, profile, etc.) - SEA encrypts automatically
- Leverage SEA's built-in security features
- Trust SEA's battle-tested implementation

### 2. Document Encryption (SEA Symmetric Encryption)
- All documents use SEA symmetric encryption (`SEA.encrypt()`/`SEA.decrypt()`) with per-document symmetric keys
- Use strong random 256-bit keys (via `crypto.subtle.generateKey()`)
- Export keys as base64 strings for use with SEA
- Never reuse keys

### 3. Key Management
- Let SEA manage user keys (authentication, ephemeral key pairs)
- Store document keys encrypted with SEA's ECDH (for authenticated sharing)
- Export document keys to base64 for URL-based sharing
- Never store plaintext document keys
- Never use public keys directly as encryption keys (always use ECDH first)

### 4. Error Handling
- Handle SEA errors gracefully
- Never expose encryption errors to user
- Log errors securely

## Implementation Checklist

- [x] SEA integration and initialization
- [x] User creation with SEA (in gunService)
- [x] User authentication with SEA (in gunService)
- [x] Document-specific key generation (256-bit random keys via Web Crypto API, exported as base64)
- [x] SEA symmetric encryption for documents (`SEA.encrypt()`)
- [x] SEA symmetric decryption for documents (`SEA.decrypt()`)
- [x] Document key encryption with SEA's ECDH (for authenticated sharing)
- [x] Document key decryption with SEA's ECDH (for authenticated sharing)
- [x] Key export for URL-based sharing
- [x] Error handling for all encryption operations
- [x] Integration with GunDB storage for encrypted documents and keys
