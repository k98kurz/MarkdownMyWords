# Holster Read API, Arrays, and Session Shape (2026-09-18)

Holster's chain API is exactly `next`, `put`, `on`, `off`. There is NO
`.once()` and NO `.get(cb)` on chains — `chain.get(cb)` silently never
fires its callback, and `chain.get(key)` after the first link re-roots
the chain at `root/<key>` and reads the WRONG node. Verified
empirically: `holster.get('x', cb)` works; `holster.get('x').get(cb)`
hangs forever; `holster.get('p').get('c', cb)` returns `null`.

Read rules (violating these hangs or corrupts reads):

- Start a chain: `holster.get(key)` or `holster.user().get(key)`
- Extend a chain: `.next(key)`
- Read current chain node: `.next(null, cb)`
- Read child: `.next(key, cb)`
- Root/user-level single read: `.get(key, cb)` (rel fields are inlined)
- Collection iteration: read the full node (`.next(null, cb)` or
  `.get(key, cb)`) and iterate with `Object.entries()`, filtering out
  `_` keys
- Reference implementations: `src/services/gunService.ts`

The hand-written types in `src/types/gun.ts` mirror the real Holster
API — do NOT loosen them. The GunDB → Holster migration originally
declared `once` and a chain `get`, so `tsc` passed while the app hung
at runtime. Never assume GunDB session/node shapes; verify against the
Holster source.

**Arrays**: NEVER `.put()` an object containing array attributes —
Holster does not support arrays as object properties and this
fundamentally breaks. Store each item as a separate node
(`node.get('docs').next(docId).put(doc)`); read collections with the
full-node + `Object.entries()` pattern above. See
`gunService.listItems()` in `src/services/gunService.ts` and
`readPrivateMap()` in `code_references/holster.md` for private data
maps.

**Connection monitoring**: Holster has NO peer events (GunDB's
`'hi'`/`'bye'` do not exist). Relay connectivity is tracked with
WebSocket probes — see `gunService.setupConnectionMonitoring()`.
`user().recall()` is synchronous.

**Session shape**: `user().is` = `{username, pub, epub, priv, epriv}` —
the SEA pair lives there, NOT in `user._.sea` (a GunDB pattern; Holster
never populates `user._`). Reading `user._.sea` returns `undefined`,
which made every private-data write fail with "User cryptographic
keypair not available" and documents could not be saved. Always get the
pair via `getUserSEA()` in `src/misc/seaHelpers.ts`, which reads
`user.is`.

# SEA Encryption & ECDH for Document Sharing (2026-09-18)

Documents are encrypted with `SEA.encrypt` using per-document symmetric
keys; keys are shared between users with SEA's built-in ECDH. NEVER
reimplement encryption, authentication, or key exchange; NEVER generate
ephemeral key pairs for ECDH; NEVER use a public key as an encryption
key or passphrase. Use the sender's EXISTING pair from `user.is` (via
`getUserSEA()`) and the recipient's existing encryption epub from the
contacts list. `encryptionService` handles document encryption and key
sharing.

```typescript
// CORRECT: per-document symmetric keys via encryptionService
const docKey = await encryptionService.generateDocumentKey();
const encrypted = await encryptionService.encryptDocument(content, docKey);

// CORRECT: SEA's ECDH shares document KEYS (not documents themselves)
// NOTE: e in epub/epriv stands for "encryption", not "ephemeral"
const sharedSecret = await SEA.secret({ epub: recipientEpub }, getUserSEA(user));
const encryptedKey = await SEA.encrypt(docKey, sharedSecret);

// CORRECT: user authentication with SEA
await holster.user().create(username, password);
await holster.user().auth(username, password);

// INCORRECT: ECDH with fresh key pairs
const ephemeralPair = await SEA.pair();
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair); // WRONG

// INCORRECT: public key used directly as encryption key
const encrypted = await SEA.encrypt(data, user.pub); // WRONG

// INCORRECT: reading profiles via the alias node directly
// holster.get(`~@username`) returns an alias index of pubs claiming that
// username, not resolved profiles — use gunService.discoverUsers()
```

History (why these rules are absolute): earlier agents generated
ephemeral key pairs instead of SEA's built-in ECDH keys, used public
keys as passphrases for self-encryption, changed the encryption API's
return types and parameters, and ignored SEA's automatic
encryption/decryption of user data — creating real security holes.
Don't touch any of this without a human.

# User Profiles & Discovery: the `~@username` Alias Index (2026-09-18)

Holster maintains a `~@username` alias index natively: `user().create()`
writes `{pub: {'#': '~pub'}}` entries under `~@username` (usernames are
NOT unique — the alias maps to multiple pubs), and `user().auth()` reads
that index to find candidate pubs. The alias index IS the directory
mechanism — do not invent a "profiles directory" node.

- App-level profile data lives at `holster.user().get('profile')`
  (soul `~pub/profile`), written by `writeProfile()`.
- Discovery (`discoverUsers()`) reads `holster.get('~@username', cb)`
  with `Object.entries()`, then reads each `~pub` node for the user's
  keys/epub.
- NEVER read `~@username` directly to fetch profiles — it is an alias
  index of pubs claiming that username, not resolved profiles. Use
  `gunService.discoverUsers()`.

Complete current implementations (`createUser`, `authenticateUser`,
`writeProfile`, `discoverUsers`, `writePrivateData`/`readPrivateData`/
`readPrivateMap`, contacts): `code_references/holster.md`.

# Functional Result Utility (2026-09-18)

Type-safe error handling lives in `src/lib/functionalResult.ts`. Use it
for operations that may fail; prefer predictable error types and
composable operations.

- `pipe` (and `flow`) are for composing MULTIPLE operations. Never wrap
  a single operation in `pipe`.
- If a `transformError` helper is needed, write it ONCE per file —
  never re-declare it at every call site.
- `src/stores/authStore.ts` is the real-world usage example;
  `src/test/functionalResult.test.ts` has comprehensive examples.

```typescript
import { pipe, chain, match } from '@/lib/functionalResult';

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

Type-system note: functionalResult is the ONLY file sanctioned to use
`any`/`as any` (required internally by `pipe`'s implementation). The
`any` ban in AGENTS.md is absolute everywhere else.

# Testing Constraints (2026-09-18)

Holster's auth/user flows do not work reliably in node. All testing is
manual, in the browser dev console — helpful tools live in
`src/dev/testRunner.ts`.

No artificial delays, ever: Holster loads SYNCHRONOUSLY from local
storage/cache, so there is nothing to "wait for". Delays added before
`.next(null, cb)`/`.get(key, cb)` or after
`await gunService.authenticateUser(...)` only mask broken read code
(usually GunDB-style `.get(cb)`/`.once()` calls — see the Holster Read
API entry above). Multiple agents have tried exponentially increasing
delays to "fix" this; it never works. Use callbacks, not delays.
