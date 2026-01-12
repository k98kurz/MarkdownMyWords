# Task List

## Document Encryption (Primary: Manual AES-256-GCM)

- [x] Implement document-specific symmetric key generation (256-bit random keys)
- [x] Implement AES-256-GCM encryption for document content
- [x] Implement AES-256-GCM decryption for document content
- [x] Test encryption/decryption with various document sizes
- [ ] Test encryption/decryption with various content types
- [x] Verify encryption is working correctly
- [x] Test that same key can decrypt multiple documents (for branching)

## Key Sharing via SEA (ECDH)

- [x] Import/configure SEA module for ECDH operations
- [x] Implement encrypting document keys with SEA's ECDH for recipients (encryptDocumentKeyWithSEA)
- [x] Implement decrypting document keys with SEA's ECDH for recipients (decryptDocumentKeyWithSEA)
- [ ] Test key encryption with recipient's ephemeral public key (requires authenticated users)
- [ ] Test key decryption with recipient's private key (requires authenticated users)
- [ ] Test that each collaborator gets their own encrypted copy of the document key (requires authenticated users)
- [x] Verify ECDH key exchange is working correctly (implementation uses sea.secret() + sea.encrypt())
- [ ] Test sharing document keys with multiple recipients (requires authenticated users)

## Key Serialization (for URL Parameters)

- [x] Implement key export to string format (for URL parameters)
- [x] Implement key import from string format (from URL parameters)
- [x] Test key serialization/deserialization round-trip
- [x] Test URL-safe encoding/decoding (base64 encoding)
- [x] Verify keys can be shared via URL parameters
- [x] Test that imported keys work for document decryption

## Service Layer

- [x] Create encryptionService file
- [x] Implement generateDocumentKey() method
- [x] Implement encryptDocument() method
- [x] Implement decryptDocument() method
- [x] Implement encryptDocumentKeyWithSEA() method (using SEA's ECDH)
- [x] Implement decryptDocumentKeyWithSEA() method (using SEA's ECDH)
- [x] Implement exportKey() method
- [x] Implement importKey() method
- [x] Implement storeEncryptedDocumentKey() method
- [x] Implement retrieveDocumentKey() method
- [x] Implement getCurrentUserPublicKey() method
- [x] Add error handling for all methods
- [x] Add type definitions (EncryptedDocument, EncryptionError, etc.)
- [x] Create unit tests for document encryption methods
- [x] Create unit tests for key serialization methods
- [x] Create unit tests for error handling

## Integration & Workflows

- [ ] Test document creation workflow (generate key → encrypt → store) - requires GunDB integration
- [ ] Test sharing workflow (encrypt key for recipient → store → recipient decrypts) - requires authenticated users
- [x] Test URL-based sharing workflow (export key → include in URL → import → decrypt) - tested via unit tests
- [ ] Test multi-branch collaboration workflow (same key for all branches) - requires document/branch system
- [ ] Test that all collaborators can decrypt all branches with shared key - requires document/branch system
- [ ] Integrate with GunDB storage for encrypted documents - requires document service
- [ ] Integrate with GunDB storage for encrypted document keys - requires document service

## Testing

- [x] Test document encryption/decryption with various sizes
- [ ] Test key sharing with multiple recipients - requires authenticated users (integration test)
- [x] Test URL-based sharing with key in parameter - tested via unit tests
- [ ] Test multi-branch collaboration with shared keys - requires document/branch system (integration test)
- [x] Test error scenarios (invalid keys, corrupted data, missing keys)
- [x] Test performance with large documents (testDocumentSizes.ts)
- [ ] Test performance with multiple collaborators - requires authenticated users (integration test)
- [x] Verify security: keys cannot be recovered without proper access (tested via error handling)
- [x] Verify security: documents cannot be decrypted without correct key (tested via error handling)
