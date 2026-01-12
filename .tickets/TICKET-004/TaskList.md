# Task List

## Document Encryption (Primary: Manual AES-256-GCM)

- [ ] Implement document-specific symmetric key generation (256-bit random keys)
- [ ] Implement AES-256-GCM encryption for document content
- [ ] Implement AES-256-GCM decryption for document content
- [ ] Test encryption/decryption with various document sizes
- [ ] Test encryption/decryption with various content types
- [ ] Verify encryption is working correctly
- [ ] Test that same key can decrypt multiple documents (for branching)

## Key Sharing via SEA (ECDH)

- [ ] Import/configure SEA module for ECDH operations
- [ ] Implement encrypting document keys with SEA's ECDH for recipients
- [ ] Implement decrypting document keys with SEA's ECDH for recipients
- [ ] Test key encryption with recipient's public key
- [ ] Test key decryption with recipient's private key
- [ ] Test that each collaborator gets their own encrypted copy of the document key
- [ ] Verify ECDH key exchange is working correctly
- [ ] Test sharing document keys with multiple recipients

## Key Serialization (for URL Parameters)

- [ ] Implement key export to string format (for URL parameters)
- [ ] Implement key import from string format (from URL parameters)
- [ ] Test key serialization/deserialization round-trip
- [ ] Test URL-safe encoding/decoding
- [ ] Verify keys can be shared via URL parameters
- [ ] Test that imported keys work for document decryption

## Service Layer

- [ ] Create encryptionService file
- [ ] Implement generateDocumentKey() method
- [ ] Implement encryptDocument() method
- [ ] Implement decryptDocument() method
- [ ] Implement encryptKeyForRecipient() method (using SEA's ECDH)
- [ ] Implement decryptKeyForMe() method (using SEA's ECDH)
- [ ] Implement exportKey() method
- [ ] Implement importKey() method
- [ ] Add error handling for all methods
- [ ] Add type definitions (EncryptedDocument, etc.)
- [ ] Create unit tests for all methods

## Integration & Workflows

- [ ] Test document creation workflow (generate key → encrypt → store)
- [ ] Test sharing workflow (encrypt key for recipient → store → recipient decrypts)
- [ ] Test URL-based sharing workflow (export key → include in URL → import → decrypt)
- [ ] Test multi-branch collaboration workflow (same key for all branches)
- [ ] Test that all collaborators can decrypt all branches with shared key
- [ ] Integrate with GunDB storage for encrypted documents
- [ ] Integrate with GunDB storage for encrypted document keys

## Testing

- [ ] Test document encryption/decryption with various sizes
- [ ] Test key sharing with multiple recipients
- [ ] Test URL-based sharing with key in parameter
- [ ] Test multi-branch collaboration with shared keys
- [ ] Test error scenarios (invalid keys, corrupted data, missing keys)
- [ ] Test performance with large documents
- [ ] Test performance with multiple collaborators
- [ ] Verify security: keys cannot be recovered without proper access
- [ ] Verify security: documents cannot be decrypted without correct key
