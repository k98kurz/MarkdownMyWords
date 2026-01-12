# AI Agent Guidelines

## Core Principles

### Prefer Built-in Library Functionality

**CRITICAL**: Always prefer functionality provided by installed dependencies and
libraries over rewriting or reimplementing them. This is especially true for:

1. **Encryption and Security** - NEVER reimplement encryption, authentication,
or cryptographic operations
   - Use GunDB's SEA for key sharing via ECDH (for sharing document keys between
   users)
   - Documents are encrypted with manual AES-256-GCM using per-document
   symmetric keys
   - SEA is used ONLY for encrypting/decrypting document keys for sharing and
   for non-document purposes, NOT for document encryption
   - Use SEA's built-in ECDH (`sea.secret()` + `sea.encrypt()`) for key sharing,
   don't reimplement ECDH
   - If SEA doesn't support a specific use case, document it clearly and use it
   only as an exception

1. **Database Operations** - Use GunDB's native APIs
   - Leverage GunDB's automatic encryption/decryption
   - Use GunDB's built-in user management (`gun.user().create()`, `gun.user().auth()`)
   - Don't reimplement graph traversal or synchronization

2. **State Management** - Use Zustand as intended
   - Follow Zustand patterns for store creation and updates
   - Don't fight the framework's intended usage

3. **Build Tools** - Use Vite, TypeScript ESLint, Vitest as configured
   - Follow their standard conventions
   - Don't create custom build scripts unless absolutely necessary

## What Went Wrong (Lessons Learned)

### Previous Mistakes with SEA Encryption

The previous AI agents reimplemented SEA's encryption incorrectly:

1. **Generated ephemeral key pairs** instead of using SEA's built-in ECDH
2. **Used public keys as passphrases** for self-encryption (completely insecure!)
3. **Broke the encryption API** by changing return types and parameters
4. **Ignored SEA's automatic encryption/decryption** for user data storage
5. **Created security vulnerabilities** by misunderstanding ECDH

### Correct SEA Usage

```typescript
// CORRECT: Documents encrypted with manual AES-256-GCM using per-document keys
const docKey = await encryptionService.generateDocumentKey();
const encrypted = await encryptionService.encryptDocument(content, docKey);

// CORRECT: Use SEA's ECDH for sharing document keys (not documents themselves)
const user = gun.user();
const userIs = user.is; // Get user's ephemeral key pair
const sharedSecret = await SEA.secret({ epub: recipientEpub }, {
  epriv: userIs.epriv,
  epub: userIs.epub
});
const encryptedKey = await SEA.encrypt(keyBase64, sharedSecret);

// CORRECT: User authentication with SEA
await gun.user().create(username, password);
await gun.user().auth(username, password);

// INCORRECT: Don't reimplement ECDH with new ephemeral keys
const ephemeralPair = await SEA.pair() // WRONG - use user's existing pair from user.is
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair) // WRONG

// INCORRECT: Don't use public key directly as encryption key
const encrypted = await SEA.encrypt(data, user.pub) // WRONG - must use ECDH first!

// INCORRECT: Don't encrypt documents with SEA - use manual AES-256-GCM
gun.user().get('documents').get(docId).put({
  content: 'Document content...' // WRONG - documents need per-document keys for sharing
})
```

## Development Guidelines

### Before Writing Code

1. **Read the library documentation** for the dependency you're about to use
2. **Check if the dependency already provides** the functionality you need
3. **Understand the library's intended usage patterns**
4. **Follow the library's conventions and best practices**

### When in Doubt

1. **Ask**: "Does this library already provide this functionality?"
2. **Read**: Library documentation and examples
3. **Search**: For existing usage patterns in the codebase
4. **Document**: Why a custom implementation was necessary (if it truly is)

### Security-Specific Rules

1. **NEVER** implement your own encryption
2. **ALWAYS** use the library's provided encryption/decryption methods
3. **NEVER** use public keys as encryption keys/passphrases
4. **ALWAYS** let the library handle key generation and management
5. **NEVER** implement your own ECDH or key exchange
6. **ALWAYS** use the library's built-in sharing mechanisms

## Code Review Checklist

When reviewing code or AI agent output, ask:

- [ ] Does this reimplement functionality that's already in a library?
- [ ] Is there a library method that does this instead?
- [ ] Does this break the library's intended usage patterns?
- [ ] Is this creating security vulnerabilities (especially with encryption)?
- [ ] Can this be simplified by using the library more directly?

## Specific Library Guidelines

### GunDB + SEA

- Use `gun.user().create()` for user creation, don't reimplement (in gunService, not encryptionService)
- Use `gun.user().auth()` for authentication, don't reimplement (in gunService, not encryptionService)
- Documents are encrypted with manual AES-256-GCM using per-document symmetric keys (NOT with SEA)
- Use SEA's ECDH (`sea.secret()` + `sea.encrypt()`) for sharing document keys, don't implement custom key exchange
- Use user's existing ephemeral key pair from `user.is` for ECDH, don't generate new ephemeral pairs
- The `encryptionService` handles document encryption (AES-256-GCM) and key sharing (SEA ECDH)

### Zustand

- Follow Zustand's vanilla pattern (create, set, get)
- Don't over-engineer with middleware unless necessary
- Keep stores simple and focused

### Vitest

- Use Vitest's built-in matchers and mocks
- Don't reinvent testing utilities

### React

- Use React hooks as intended (useState, useEffect, useCallback, useMemo)
- Don't fight React's rendering model
- Use controlled components for forms

---

**REMEMBER**: The best code is the code you don't have to write. Libraries exist for a reason - use them!

## Code Style Rules

### STOP REMOVING SEMICOLONS

- **DO NOT** remove existing semicolons from code
- If semicolons are present in the codebase, keep them
- Only add semicolons if they were removed accidentally
- Preserve the existing code formatting style
