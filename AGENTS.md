# AI Agent Guidelines

## Process Notes

1. Do not run `npm run dev` or `npm test`. They are not functional/safe for agentic code development. A human will test manually.
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
   - User management patterns: See `code_references/gundb.md` for user creation,
     profile storage, private data storage, and contacts

2. **Database Operations** - Use GunDB's native APIs
   - Use GunDB's built-in user management (`gun.user().create()`, `gun.user().auth()`)
   - Don't reimplement graph traversal or synchronization

3. **State Management** - Use Zustand as intended
   - Follow Zustand patterns for store creation and updates
   - Don't fight the framework's intended usage

4. **Build Tools** - Use Vite, TypeScript ESLint
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

### SEA ECDH for Document Sharing

Documents encrypted with SEA.encrypt using per-document keys
and shared using SEA's ECDH:

```typescript
// CORRECT: Documents encrypted with SEA.encrypt using per-document keys
const docKey = await encryptionService.generateDocumentKey();
const encrypted = await encryptionService.encryptDocument(content, docKey);

// CORRECT: Use SEA's ECDH for sharing document keys (not documents themselves)
// NOTE: e in epub/epriv stands for "encryption", not "ephemeral"
const sharedSecret = await SEA.secret({ epub: recipientEpub }, user._.sea);
const encryptedKey = await SEA.encrypt(docKey, sharedSecret);

// CORRECT: User authentication with SEA
await gun.user().create(username, password);
await gun.user().auth(username, password);

// INCORRECT: Don't use ECDH with new key pairs
const ephemeralPair = await SEA.pair(); // WRONG - use user's existing pair from user._.sea
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair); // WRONG

// INCORRECT: Don't use public key directly as encryption key
const encrypted = await SEA.encrypt(data, user.pub); // WRONG

// INCORRECT: Don't use gun.get(~@username) directly for reading user profiles
// This returns a list of "souls" claiming that username
// For proper usage, use gunService.discoverUsers()
```

### GunDB Profile Storage Pattern

**IMPORTANT**: User profile storage uses the `~@username` pattern with
`gun.user().put()`. The commonly suggested 'profiles directory' pattern
is not used because it is insecure.

See `code_references/gundb.md` for the current `writeProfile()` and
`discoverUsers()` implementations.

**INCORRECT**: Never use `gun.get(~@username)` directly for reading user profiles
without proper handling - it returns a list of "souls" claiming that username.
For proper usage with `.map()` to collect profiles, see `discoverUsers()` in
`code_references/gundb.md`.

## Development Guidelines

### Functional Result Utility

Type-safe error handling utility at `src/utils/functionalResult.ts` for operations
that may fail. Use for predictable error types and composable operations.

Notes:
- **DO NOT** use `pipe` with a single operation. That is retarded nonsense. `pipe` is
for **multiple** operations.
- **DO NOT** write the same `transformError` helper function a thousand times in a
single file. Write it **once**.

Example usage from `src/stores/authStore.ts`:

```typescript
import { pipe, chain, match } from '../utils/functionalResult';

// Compose operations with error handling
const result = await pipe(
  validateAuthInput(username, password), // Validates first
  chain(async () => {
    await gunService.authenticateUser(username, password);
    return getAuthenticatedUser();
  })
);

// Handle success/failure
match(
  user => set({ user, isAuthenticated: true }),
  error => set({ error, isAuthenticated: false })
)(result);
```

See `src/test/functionalResult.test.ts` for comprehensive examples.

### Before Writing Code

1. **Read library documentation** for dependency you're about to use
2. **Check if dependency already provides** functionality you need
3. **Understand library's intended usage patterns**
4. **Follow library's conventions and best practices**

### When in Doubt

1. **Ask**: "Does this library already provide this functionality?"
2. **Read**: Library documentation and examples
3. **Search**: For existing usage patterns in codebase
4. **Document**: Why a custom implementation was necessary (if it truly is)
5. **For type-safe error handling**, use `functionalResult` from `src/utils/functionalResult.ts`
   - See `src/stores/authStore.ts` for real-world usage example
   - See `src/test/functionalResult.test.ts` for comprehensive examples

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

- User management and private data: See `code_references/gundb.md` for complete patterns
  - `createUser()` / `authenticateUser()` for user creation and login
  - `writeProfile()` / `discoverUsers()` for profile storage and discovery
  - `writePrivateData()` / `readPrivateData()` / `readPrivateMap()` for encrypted storage
- Documents are encrypted with SEA.encrypt using per-document symmetric keys
- Use SEA's ECDH (`sea.secret()` + `sea.encrypt()`) for sharing document keys, don't implement custom key exchange
- Use sender's existing encryption key pair from `user._.sea` for ECDH, don't generate new key pairs
- User recipient's existing encryption public key from the contacts list for ECDH
- The `encryptionService` handles document encryption and key sharing (SEA ECDH)
- **Array/List Handling**: NEVER use `.put()` with objects containing array attributes
  - GunDB does NOT support storing arrays as object properties - this fundamentally breaks
  - Use `.map()` to iterate and read array/list data
  - Store each item as a separate node using `.get(key).put(value)` pattern
  - Reading arrays requires collecting from `.map()` with a timeout pattern
  - See `gunService.listItems()` at `src/services/gunService.ts:396` for correct pattern
  - See `readPrivateMap()` in `code_references/gundb.md` for private data maps

### Zustand

- Follow Zustand's vanilla pattern (create, set, get)
- Don't over-engineer with middleware unless necessary
- Keep stores simple and focused

### Testing

- Because GunDB does not work reliably in node, all tests must be done in the
  browser dev console
- There are helpful tools for testing in `src/utils/testRunner.ts`

### React

- Use React hooks as intended (useState, useEffect, useCallback, useMemo)
- Don't fight React's rendering model
- Use controlled components for forms

## GunDB + SEA Reference

**User Management & Private Data**: See `code_references/gundb.md` for:

- User creation/authentication with `~@username` profiles
- Private data storage with hashed paths
- Contact system implementation

**Document Sharing**: See 'Correct SEA Usage (Legacy Document Sharing)' section for:

- ECDH key exchange using SEA.secret()
- Per-document symmetric key encryption

---

**REMEMBER**: The best code is the code you don't have to write. Libraries exist for a reason - use them!

## Code Style Rules

### STOP REMOVING SEMICOLONS

- **DO NOT** remove existing semicolons from code
- **ALWAYS USE SEMICOLONS** at the end of every line of TypeScript/JavaScript
- Preserve the existing code formatting style

### NEVER USE "any" TYPE OR "as any" ASSERTIONS

- **ABSOLUTELY FORBIDDEN**: The use of `any` type or `as any` type assertions is strictly prohibited
- **ONLY 1 EXCEPTION**: ONLY the functionalResult utility is allowed to use `any` because it is necessary for `pipe`
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
- **NEVER** run test commands like `npm run test` unless explicitly requested
- All development and testing should be done through proper code review and static analysis
