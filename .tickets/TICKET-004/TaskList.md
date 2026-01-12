# Task List

## SEA Integration

- [x] Install/import GunDB SEA module
- [x] Initialize SEA with GunDB instance
- [x] Configure SEA settings
- [x] Test SEA initialization

## User Operations with SEA

- [x] Implement user creation with SEA
- [x] Implement user authentication with SEA
- [x] Test user creation flow
- [x] Test user authentication flow
- [x] Handle SEA authentication errors

## Document Encryption with SEA

- [x] Implement document storage with SEA encryption
- [x] Implement document retrieval with SEA decryption
- [x] Test automatic encryption/decryption
- [ ] Test with various document sizes
- [x] Verify encryption is working correctly

## Sharing with SEA (ECDH)

- [x] Implement sharing using SEA's ECDH
- [x] Encrypt data with recipient's public key
- [ ] Test key exchange via ECDH
- [x] Test decryption by recipient
- [x] Verify shared secret derivation

## Fallback: Manual Encryption (for Branching)

- [x] Implement document-specific key generation
- [x] Implement manual AES-256-GCM encryption
- [x] Implement manual AES-256-GCM decryption
- [x] Test document key encryption/decryption
- [x] Integrate with SEA for key encryption

## Hybrid Approach (Document Keys + SEA)

- [x] Generate document-specific keys
- [x] Encrypt document with document key (manual)
- [x] Encrypt document key with SEA's ECDH for each collaborator
- [x] Store encrypted document keys
- [x] Test full sharing flow with document keys

## Service Layer

- [x] Create encryptionService file
- [x] Implement all SEA methods
- [x] Implement fallback manual methods
- [x] Add error handling
- [x] Add type definitions
- [x] Create unit tests

## Testing

- [ ] Test SEA operations
- [x] Test manual encryption (fallback)
- [x] Test hybrid approach (document keys + SEA)
- [x] Test error scenarios
- [x] Test performance
