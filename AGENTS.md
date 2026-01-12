# AI Agent Guidelines

## Core Principles

### Prefer Built-in Library Functionality

**CRITICAL**: Always prefer functionality provided by installed dependencies and libraries over rewriting or reimplementing them. This is especially true for:

1. **Encryption and Security** - NEVER reimplement encryption, authentication, or cryptographic operations
   - Use GunDB's SEA for all encryption operations
   - SEA provides ECDH key exchange, automatic encryption/decryption, and secure key management
   - The encryption service should be a thin wrapper around SEA, not a custom implementation
   - If SEA doesn't support a specific use case, document it clearly and use it only as an exception

2. **Database Operations** - Use GunDB's native APIs
   - Leverage GunDB's automatic encryption/decryption
   - Use GunDB's built-in user management (`gun.user().create()`, `gun.user().auth()`)
   - Don't reimplement graph traversal or synchronization

3. **State Management** - Use Zustand as intended
   - Follow Zustand patterns for store creation and updates
   - Don't fight the framework's intended usage

4. **Build Tools** - Use Vite, TypeScript ESLint, Vitest as configured
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
// CORRECT: Use SEA's automatic encryption for user data
gun.user().get('documents').get(docId).put({
  title: 'My Document',
  content: 'Document content...', // SEA encrypts automatically
})

// CORRECT: Use SEA's ECDH for sharing
gun.user(recipientPub).get('shared').get(docId).put({
  content: 'Shared content', // SEA handles ECDH key exchange
})

// INCORRECT: Don't reimplement ECDH with ephemeral keys
const ephemeralPair = await SEA.pair() // WRONG - not needed
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair) // WRONG

// INCORRECT: Don't use public key as passphrase
const encrypted = await SEA.encrypt(data, user.pub) // WRONG - pub is public!
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

- Use `gun.user().create()` for user creation, don't reimplement
- Use `gun.user().auth()` for authentication, don't reimplement
- Use `gun.user().get().put()` for storing user data (auto-encrypted)
- Use SEA's ECDH for sharing, don't implement custom key exchange
- The `encryptionService` should be minimal, primarily exposing SEA functionality

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
