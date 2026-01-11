# Discussion

## SEA as Primary

### Why SEA?
- Built-in, well-tested encryption
- Automatic encryption/decryption
- ECDH-based sharing (efficient)
- Integrated with GunDB
- Less code to maintain

### SEA Features Used
- User authentication
- Automatic data encryption
- ECDH key exchange for sharing
- Certificate-based access control

## Manual Encryption (Fallback)

### When to Use
- **Document-specific keys**: For branching model, we need keys that are document-specific but can be shared
- **Specific requirements**: Only when SEA cannot support a feature

### Implementation
- Generate random 256-bit keys
- Use AES-256-GCM for encryption
- Encrypt document keys with SEA's ECDH for sharing

## Hybrid Approach

### Document Keys + SEA
1. Generate document-specific key (random)
2. Encrypt document with document key (manual AES-256-GCM)
3. Encrypt document key with SEA's ECDH for each collaborator
4. Store encrypted document keys in GunDB

This combines:
- Document-specific keys (enables branching)
- SEA's efficient ECDH sharing
- Best of both approaches

## Performance

- SEA: Automatic, optimized
- Manual: Only for specific use cases
- Hybrid: Efficient sharing with document keys
