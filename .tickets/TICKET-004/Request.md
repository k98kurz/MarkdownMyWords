# [TICKET-004] Encryption System Implementation

## Metadata
- **Status**: ready
- **Complexity**: task_list
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 4h
- **Depends on**: TICKET-002, TICKET-003

## Request

Implement the encryption system using GunDB's SEA as the primary method, with manual AES-256-GCM as a fallback only where needed for document-specific keys in the branching model.

### User Story

As a developer, I want a complete encryption system so that all document content is encrypted before storage and can only be decrypted with the correct key.

### Requirements

1. **SEA Integration**
   - Initialize and configure SEA
   - User creation with SEA
   - User authentication with SEA
   - Automatic encryption/decryption with SEA

2. **Document Encryption (SEA)**
   - Use SEA for standard document encryption
   - Automatic encryption when storing in GunDB
   - Automatic decryption when reading from GunDB

3. **Sharing with SEA (ECDH)**
   - Use SEA's ECDH for sharing documents
   - Encrypt with recipient's public key
   - Automatic key exchange via ECDH

4. **Fallback: Manual Encryption (for Branching)**
   - Document-specific key generation (for branching model)
   - Manual AES-256-GCM encryption for document keys
   - Encrypt document keys with SEA's ECDH for collaborators

5. **Service Layer**
   - `encryptionService` with SEA operations
   - Fallback manual encryption methods
   - Error handling
   - Type definitions

## Acceptance Criteria

- [ ] SEA initialized and configured
- [ ] User creation with SEA working
- [ ] User authentication with SEA working
- [ ] Document encryption with SEA working
- [ ] Document sharing with SEA's ECDH working
- [ ] Document-specific key generation (for branching)
- [ ] Manual AES-256-GCM encryption (fallback only)
- [ ] Document key encryption with SEA working
- [ ] Error handling implemented
- [ ] Service tested with various scenarios

## Technical Notes

### Encryption Service Interface

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

### Encryption Strategy

- **Primary**: Use SEA for all standard encryption
- **Fallback**: Manual AES-256-GCM only for document-specific keys (branching model)
- **Sharing**: Use SEA's ECDH for key exchange

## Related

- TICKET-001: Encryption architecture (reference)
- TICKET-003: GunDB integration (SEA requires GunDB)
- TICKET-008: Sharing & Permissions (uses SEA's ECDH)
