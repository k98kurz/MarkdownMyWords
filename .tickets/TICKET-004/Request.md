# [TICKET-004] Encryption System Implementation

## Metadata
- **Status**: pending_review
- **Complexity**: task_list
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 4h
- **Depends on**: TICKET-002, TICKET-003

## Request

Implement the encryption system using manual AES-256-GCM for document encryption with document-specific symmetric keys, and GunDB's SEA for sharing those keys between users via ECDH. This enables URL-based sharing and multi-branch collaboration where all branches use the same encryption key.

### User Story

As a developer, I want a complete encryption system so that:
- All document content is encrypted with shared symmetric keys before storage
- Documents can be shared via URL parameters containing the decryption key
- Multiple users can collaborate on branches of the same document, all encrypted with the same key
- Document keys are securely shared between users using SEA's ECDH

### Requirements

1. **Document Encryption (Primary: Manual AES-256-GCM)**
   - Generate document-specific symmetric keys (256-bit random keys)
   - Encrypt document content using AES-256-GCM with the document key
   - Decrypt document content using the same document key
   - This enables: URL-based sharing, multi-branch collaboration with shared keys

2. **Key Sharing via SEA (ECDH)**
   - Use SEA's ECDH to encrypt document keys for each collaborator
   - Encrypt document key with recipient's public key using SEA's ECDH
   - Decrypt document key using recipient's private key
   - Store encrypted document keys (one per collaborator) in GunDB

3. **Key Serialization (for URL Parameters)**
   - Export document keys to string format for URL parameters
   - Import document keys from string format
   - Secure key encoding/decoding

4. **Service Layer**
   - `encryptionService` with document encryption methods
   - SEA operations for key sharing only
   - Error handling
   - Type definitions

## Acceptance Criteria

- [ ] Document-specific symmetric key generation working
- [ ] Document encryption with AES-256-GCM working
- [ ] Document decryption with AES-256-GCM working
- [ ] Document key encryption with SEA's ECDH for recipients working
- [ ] Document key decryption with SEA's ECDH for recipients working
- [ ] Key serialization/deserialization for URL parameters working
- [ ] Multi-branch collaboration with shared keys working
- [ ] URL-based sharing with key in parameter working
- [ ] Error handling implemented
- [ ] Service tested with various scenarios (single user, sharing, branching)

## Technical Notes

### Encryption Workflow

1. **Document Creation:**
   - Generate a document-specific symmetric key (256-bit random)
   - Encrypt document content with AES-256-GCM using the document key
   - Store encrypted document in GunDB

2. **Sharing with Collaborators:**
   - For each collaborator, encrypt the document key using SEA's ECDH with their public key
   - Store encrypted document keys (one per collaborator) in GunDB
   - Collaborator uses their private key to decrypt their copy of the document key
   - Collaborator uses the decrypted document key to decrypt the document

3. **URL-Based Sharing:**
   - Export document key to string format
   - Include key in URL parameter
   - Recipient imports key from URL parameter
   - Recipient uses key to decrypt document

4. **Multi-Branch Collaboration:**
   - All branches of a document use the same document key
   - Each branch is encrypted with the same key
   - All collaborators can decrypt all branches using the shared key

### Encryption Service Interface

```typescript
interface EncryptionService {
  // Document encryption (primary: manual AES-256-GCM)
  generateDocumentKey(): Promise<CryptoKey>;
  encryptDocument(content: string, key: CryptoKey): Promise<EncryptedDocument>;
  decryptDocument(encrypted: EncryptedDocument, key: CryptoKey): Promise<string>;

  // Key sharing (SEA's ECDH)
  encryptKeyForRecipient(docKey: CryptoKey, recipientPub: string): Promise<string>;
  decryptKeyForMe(encryptedKey: string): Promise<CryptoKey>;

  // Key serialization (for URL parameters)
  exportKey(key: CryptoKey): Promise<string>;
  importKey(keyString: string): Promise<CryptoKey>;
}
```

### Encryption Strategy

- **Document Encryption**: Manual AES-256-GCM with document-specific symmetric keys
  - Enables URL-based sharing
  - Enables multi-branch collaboration with shared keys
  - Documents are NOT encrypted with SEA (they use manual AES-256-GCM)

- **Key Sharing**: SEA's ECDH for encrypting/decrypting document keys
  - Document keys are encrypted with SEA's ECDH for each collaborator
  - Uses recipient's public key for ECDH key exchange
  - Each collaborator gets their own encrypted copy of the document key

### Important Notes

- **User operations** (createUser, authenticateUser) belong in the auth service, NOT the encryption service
- **SEA is NOT used for document encryption** - it's only used for sharing document keys
- **Documents are encrypted with manual AES-256-GCM**, not with SEA
- **The document key is what gets shared via SEA's ECDH**, not the document itself

## Related

- TICKET-001: Encryption architecture (reference)
- TICKET-003: GunDB integration (SEA requires GunDB)
- TICKET-008: Sharing & Permissions (uses SEA's ECDH)
