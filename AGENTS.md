# AI Agent Guidelines

## Process Notes

1. Do not run `npm run dev` or `npm test`. They are not functional for agentic code development.
2. Use `npm run build` and linting to check for syntax errors.

## Core Principles

### Prefer Built-in Library Functionality

**CRITICAL**: Always prefer functionality provided by installed dependencies and
libraries over rewriting or reimplementing them. This is especially true for:

1. **Encryption and Security** - NEVER reimplement encryption, authentication,
   or cryptographic operations
   - Use GunDB's SEA for key sharing via ECDH (for sharing document keys between
     users)
   - Documents are encrypted with SEA.encrypt using per-document symmetric keys
   - SEA is used for all encryption and ECDH purposes
   - Use SEA's built-in ECDH (`sea.secret()` + `sea.encrypt()`) for key sharing,
     don't reimplement ECDH

1. **Database Operations** - Use GunDB's native APIs
   - Leverage GunDB's automatic encryption/decryption for user data (`gun.get('~@path')`)
   - Use GunDB's built-in user management (`gun.user().create()`, `gun.user().auth()`)
   - Don't reimplement graph traversal or synchronization

1. **State Management** - Use Zustand as intended
   - Follow Zustand patterns for store creation and updates
   - Don't fight the framework's intended usage

1. **Build Tools** - Use Vite, TypeScript ESLint, Vitest as configured
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
// CORRECT: Documents encrypted with SEA.encrypt using per-document keys
const docKey = await encryptionService.generateDocumentKey()
const encrypted = await encryptionService.encryptDocument(content, docKey)

// CORRECT: Use SEA's ECDH for sharing document keys (not documents themselves)
// NOTE: the e in epub/epriv stands for "encryption", not "ephemeral"

// First, store user profile when creating user (standard GunDB practice)
user.auth(alias, pass, ack => {
  const pair = user._.sea
  gun.get('profiles').get(alias).put({
    pub: pair.pub,
    epub: pair.epub,
  })
})

// Then read epub from profiles directory for ECDH
const user = gun.user()
const recipientEpub = await new Promise<string>((resolve, reject) => {
  gun
    .get('profiles')
    .get(recipientUsername)
    .get('epub')
    .once((data: any) => {
      if (data) {
        resolve(data)
      } else {
        reject(new Error(`Failed to read ${recipientUsername}'s epub from profiles`))
      }
    })
})
const sharedSecret = await SEA.secret({ epub: recipientEpub }, user._.sea)
const encryptedKey = await SEA.encrypt(docKey, sharedSecret)

// CORRECT: User authentication with SEA
await gun.user().create(username, password)
await gun.user().auth(username, password)

// INCORRECT: Don't reimplement ECDH with new ephemeral keys
const ephemeralPair = await SEA.pair() // WRONG - use user's existing pair from user._.sea
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair) // WRONG

// INCORRECT: Don't use public key directly as encryption key
const encrypted = await SEA.encrypt(data, user.pub) // WRONG - must use ECDH first!

// INCORRECT: Don't use gun.get(~@username) for reading user profiles
const recipientEpub = await gun.get(`~@${recipientUsername}`).get('epub').then() // WRONG - returns list of "souls"
// Instead use profiles directory pattern shown above
```

### GunDB Profile Storage Pattern

**CRITICAL**: Always use the profiles directory pattern for storing and reading user epubs:

```typescript
// CORRECT: Store user profiles during user creation
user.auth(alias, pass, ack => {
  const pair = user._.sea
  gun.get('profiles').get(alias).put({
    pub: pair.pub,
    epub: pair.epub,
  })
})

// CORRECT: Read user epubs from profiles directory
const recipientEpub = await new Promise<string>((resolve, reject) => {
  gun
    .get('profiles')
    .get(recipientUsername)
    .get('epub')
    .once((data: any) => {
      if (data) {
        resolve(data)
      } else {
        reject(new Error(`Failed to read ${recipientUsername}'s epub from profiles`))
      }
    })
})
```

**INCORRECT**: Never use `gun.get(~@username)` for reading user profiles - it returns a list of "souls" claiming that username, not a single profile.

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
- Documents are encrypted with SEA.encrypt using per-document symmetric keys
- Use SEA's ECDH (`sea.secret()` + `sea.encrypt()`) for sharing document keys, don't implement custom key exchange
- Use user's existing encryption key pair from `user._.sea` for ECDH, don't generate new key pairs
- The `encryptionService` handles document encryption and key sharing (SEA ECDH)

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

### NEVER USE "any" TYPE OR "as any" ASSERTIONS

- **ABSOLUTELY FORBIDDEN**: The use of `any` type or `as any` type assertions is strictly prohibited
- **NO EXCEPTIONS**: Under no circumstances should `any` be used anywhere in the codebase
- `as any` covers up type errors and leads to runtime bugs and maintenance issues
- If you encounter a type error, fix it properly by:
  - Adding proper type definitions
  - Using `unknown` and type guards when the type is truly unknown
  - Creating proper interfaces or types for the data structure
  - Using generics when appropriate
- If you see existing `any` usage, replace it with proper types as part of your changes
- Type safety is critical - don't bypass it with `any`

### NEVER USE "as unknown as" to cover up type erorrs

- **ABSOLUTELY FORBIDDEN**: Covering up type errors with `as unknown` or
  `as unknown as` is strictly prohibited because it is extremely harmful
- **NO EXCEPTIONS**: Under no circumstances are type errors to be covered up
- If you have a type error, it means the way you are writing the code is WRONG
- DO NOT PERSIST IN ERROR
- DO NOT COVER UP ERRORS
- **FIX ERRORS** and write **ACCURATE CODE**

### Tool Usage Restrictions

- **NEVER** run `npm run dev` or any development server commands
- **NEVER** run build commands like `npm run build` unless explicitly requested
- **NEVER** run test commands like `npm run test` unless explicitly requested
- All development and testing should be done through proper code review and static analysis
