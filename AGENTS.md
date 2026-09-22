# AI Agent Guidelines

## Process Notes

1. Do not run `npm run dev` or `npm test`. They are not functional/safe for
agentic code development. All testing must be done in the browser, manually,
by a human (see docs/memory.md for why).
2. Use `npm run build` and linting to check for syntax errors.
3. Do not reference anything in the `.old/` directory as it contains outdated
and deprecated information.
4. There are currently no users or deployments of this anywhere, and thus no
need for backwards compatibility. Just make clean changes.
5. Use '@/path/to/import' alias in imports instead of relative '../path'.
6. Do not use 'text-sm' className as it is hard to read.
7. Do not propose to create a 'utils/' directory. 'utils/' is banned because
it has no coherent meaning. Use 'misc/' or 'lib/' instead.

## Memory

Major architectural decisions, best practices, and other things worth
remembering long-term are stored in docs/memory.md. All entries in
docs/memory.md must be actionable, not merely a historical record of churn.
Read the relevant entry BEFORE touching Holster, SEA/encryption, document
sharing, or `@k98kurz/functional-result`.

## Discovery of Development Practices

If you encounter a substantial issue that bogged down development, in
particular something that is likely to cause problems in the future, and you
discovered a solution, create an entry in docs/memory.md concisely explaining
the problem and solution for future development efforts, and alert your human
that you did. Such entries must be concise and contain actionable information.

## Core Principles

### Prefer Built-in Library Functionality

**CRITICAL**: Always prefer functionality provided by installed dependencies
and libraries over rewriting or reimplementing them. This is especially true
for:

1. **Encryption and Security** - NEVER reimplement encryption, authentication,
   or cryptographic operations. SEA handles all of it (see docs/memory.md).
2. **Database Operations** - Use Holster's native APIs
   (`holster.user().create()`, `holster.user().auth()`); don't reimplement
   graph traversal or synchronization (see docs/memory.md).
3. **State Management** - Use Zustand as intended. Follow Zustand patterns for
   store creation and updates; don't fight the framework's intended usage.
4. **Build Tools** - Use Vite, TypeScript ESLint. Follow their standard
   conventions; don't create custom build scripts unless absolutely necessary.

### Before Writing Code

1. **Read library documentation** for the dependency you're about to use
2. **Check if the dependency already provides** the functionality you need
3. **Understand the library's intended usage patterns**
4. **Follow the library's conventions and best practices**

### When in Doubt

1. **Ask**: "Does this library already provide this functionality?"
2. **Read**: Library documentation and examples
3. **Search**: For existing usage patterns in the codebase
4. **Document**: Why a custom implementation was necessary (if it truly is)
5. **For type-safe error handling**, use `@k98kurz/functional-result` — read
   docs/memory.md first (e.g. `pipe` is for multiple operations only).

## Code Review Checklist

When reviewing code or AI agent output, ask:

- [ ] Does this reimplement functionality that's already in a library?
- [ ] Is there a library method that does this instead?
- [ ] Does this break the library's intended usage patterns?
- [ ] Is this creating security vulnerabilities (especially with encryption)?
- [ ] Can this be simplified by using the library more directly?
- DO NOT WASTE MY TIME WRITING TESTS FOR TRIVIAL SHIT. Test should be focused
on IMPORTANT THINGS ONLY. DO NOT WRITE TESTS TO VALIDATE DEFAULTS OR TYPES
SPECIFIED IN TYPE ANNOTATIONS AND FUNCTION DEFINITIONS.
- Do not shit out insane amounts of useless code for shit that doesn't fucking
matter.

## Specific Library Guidelines

### Holster + SEA

Before touching Holster, SEA, encryption, or document sharing code, read the
relevant docs/memory.md entries (read API rules, session shape, arrays, ECDH,
profiles/discovery). Complete implementation patterns:
`code_references/holster.md`.

User discovery uses the `~@username` alias index, which Holster maintains
natively. It is a standalone soul, so read it via the wire spec — never
root-level `.get()` (see `code_references/holster.md` §5).

### Zustand

- Follow Zustand's vanilla pattern (create, set, get)
- Don't over-engineer with middleware unless necessary
- Keep stores simple and focused

### React

- Use React hooks as intended (useState, useEffect, useCallback, useMemo)
- Don't fight React's rendering model
- Use controlled components for forms

## Code Style Rules

### NEVER USE "any" TYPE OR "as any" ASSERTIONS

- **ABSOLUTELY FORBIDDEN**: The use of `any` type or `as any` type assertions
is strictly prohibited.
- `as any` covers up type errors and leads to runtime bugs and maintenance
issues. If you encounter a type error, fix it properly by:
  - Adding proper type definitions
  - Using `unknown` and type guards when the type is truly unknown
  - Creating proper interfaces or types for the data structure
  - Using generics when appropriate
- If you see existing `any` usage, replace it with proper types as part of
your changes
- Type safety is critical - don't bypass it with `any`

### NEVER USE "as unknown as" TO COVER UP TYPE ERRORS

- **ABSOLUTELY FORBIDDEN**: Covering up type errors with `as unknown` or
`as unknown as` is strictly prohibited because it is extremely harmful.
- **NO EXCEPTIONS**: Under no circumstances are type errors to be covered up.
If you have a type error, it means the way you are writing the code is WRONG.
DO NOT PERSIST IN ERROR. DO NOT COVER UP ERRORS. **FIX ERRORS** and write
**ACCURATE CODE**.

### Tool Usage Restrictions

- **NEVER** run `npm run dev` or any development server commands
- **NEVER** run test commands like `npm run test` unless explicitly requested
- All development and testing should be done through proper code review and
static analysis

### NEVER USE ARTIFICIAL DELAYS IN TESTS

- **FORBIDDEN**: Any `setTimeout` in test files, or any delay added to "wait
for data" or "wait for auth synchronization", without explicit instruction
from a human.
- Delays mask broken Holster read code; they never fix it. See docs/memory.md
("Testing Constraints").
