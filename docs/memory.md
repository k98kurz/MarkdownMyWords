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

**Standalone souls vs root properties** (2026-09-19): root-level
`.get(key, cb)` reads only PROPERTIES of the `root` soul (it resolves
`root[key]`, following rels). Souls written directly by `user().create()`
— `~pub` (user node) and `~@username` (alias index) — are standalone
graph souls, NOT root properties, so root-level `.get()` ALWAYS returns
null for them (holster.js resolve() "never written" branch). This
silently broke `discoverUsers`/`readUsername` (test suite 2 "Create
user"); retries/timeouts can't fix a read that can never succeed. Read
standalone souls via the wire spec:
`holster.wire.get({'#': soul}, msg => msg.put[soul])` — the pattern
`user().auth()` itself uses. Raw wire reads do NOT inline rels (entries
arrive as `{'#': soul}`; follow them with further wire reads); chain
reads DO inline rels. Helper: `gunService.readSoul()`.

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

# Holster Callbacks Are Node-Style: String Errors, Never Object Acks (2026-09-20)

Holster's `user().create()`, `user().auth()`, and chain `.put()` callbacks
follow the Node convention: the argument is a plain STRING error message
(`"Username already exists"`, `"Wrong username or password"`, `"error ..."`)
or `null`/`undefined` on success. There is NO GunDB-style `{err: "..."}`
object ack anywhere (verified in
`node_modules/@mblaney/holster/src/user.js` and `holster.js`).

- Error check is TRUTHINESS: `if (ack) reject(...)` — never
  `typeof ack === 'object' && ack.err`. The `{err}`-shaped check silently
  converts EVERY error into success. This broke duplicate-registration
  detection (registering a taken username logged you into that account
  instead of failing) and made all document write/delete/share failures
  silent; `GunAck` in `src/types/gun.ts` encoded the wrong GunDB shape and
  was replaced by `AckCallback = (err: string | null | undefined) => void`.
- `transformAuthError` in `src/stores/authStore.ts` matches on the message
  prefixes `User creation failed` / `Authentication failed` — keep those
  prefixes intact when touching `gunService.createUser`/`authenticateUser`.
- Wire-layer messages (`wire.get`/`wire.put` raw JSON) ARE objects with
  `put`/`err` fields — that convention applies only to raw wire reads
  (`gunService.readSoul`), not API callbacks.
- In pipelines, check each Result and short-circuit before the next
  operation (see `authStore.register`); `await`-ing several operations into
  an array and passing them to `sequence` runs ALL of them before any
  failure check.

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
const docKey = await encryptionService.generateKey();
const encrypted = await encryptionService.encrypt(content, docKey);

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

# Holster SEA Object Shapes (2026-09-18)

Holster's SEA (`node_modules/@mblaney/holster/src/sea.js`) is NOT Gun's
string-based SEA. Code written against Gun's API compiles if types are
loose but fails at runtime. Rules (mirrored by `SEACipher`/`SEAPair`/
`SEAInstance` in `src/types/gun.ts`):

- Keys must be OBJECTS: `SEA.encrypt(data, {epriv: keyString})`. A bare
  string key hits the `!pair.epriv` guard and returns null. This is why
  `runAllTests` Suite 1 failed with "encryption failed" while
  `generateKey()` succeeded (it uses raw WebCrypto, not SEA).
- `SEA.encrypt` returns a cipher OBJECT `{ct, iv, s}` (base64 fields),
  never a string. To store as a string, `JSON.stringify` it; parse
  before decrypt. `encryptionService.encrypt/decrypt` do this — keep
  their string-in/string-out API.
- Failure sentinel is `null` (encrypt's key guard AND decrypt's
  wrong-key path), never `undefined`. Check falsy/null — a
  `=== undefined` check turns failures into `success(null)` and
  silently corrupts data (this hid the document-store breakage).
- `SEA.work()` and `SEA.secret()` return `{epriv}` pair objects.
  Extract `.epriv` for hashed path strings — returning the whole
  object as a path makes Holster coerce it with `String(key)` to the
  literal `'[object Object]'`, colliding every private path into one
  node (docKeys were silently overwriting each other; fixed in
  `gunService.getPrivatePathPart`).
- `SEA.secret()` takes `{epub}`, never a bare epub string (returns
  null otherwise).
- `SEA.decrypt` runs `utils.parse` on plaintext: plaintext that is
  itself valid JSON (`123`, `{"a":1}`) comes back re-serialized, so
  round-trips are not byte-identical. The service coerces non-strings
  back with `JSON.stringify`.
- Cipher values read back from nodes carry extra `_` graph metadata;
  validate with `isSEACipher()` (`src/misc/seaHelpers.ts`), which
  checks for ct/iv/s fields.
- Hard size cap (asymmetric): SafeBuffer
  (`@mblaney/holster/src/buffer.js`) limits strings to 1 MiB
  (`MAX_STRING_LENGTH`). Encrypt allows ~1 MiB plaintext (ct binary
  string check), but DECRYPT is the binding limit:
  `SafeBuffer.from(ct, "base64")` (sea.js) rejects ciphertext base64
  strings >1 MiB chars => ~786 KB plaintext max — and it throws the
  RangeError OUTSIDE SEA.decrypt's try/catch, so it rejects the
  promise instead of returning null. `encryptionService` pre-checks
  `MAX_PLAINTEXT_BYTES` (786,000) and fails with a clear
  ENCRYPTION_FAILED message. If large documents are ever needed,
  chunking belongs at the service layer; multi-MB Holster values hit
  storage/relay limits anyway.

The legacy string-based GunDB SEA surface is preserved only as a
historical reference: `code_references/holster.d.ts` (its original
typing) alongside `code_references/testNewGunSEAScheme.ts` (the dev
tool that validated the old scheme). Do not use either as a reference.
`src/types/holster.d.ts` now declares only a loose default export; the
real API types live in `src/types/gun.ts`.

# User Profiles & Discovery: the `~@username` Alias Index (2026-09-18)

Holster maintains a `~@username` alias index natively: `user().create()`
writes `{pub: {'#': '~pub'}}` entries under `~@username` (usernames are
NOT unique — the alias maps to multiple pubs), and `user().auth()` reads
that index to find candidate pubs. The alias index IS the directory
mechanism — do not invent a "profiles directory" node.

- App-level profile data lives at `holster.user().get('profile')`
  (soul `~pub/profile`), written by `writeProfile()`.
- Discovery (`discoverUsers()`) reads the `~@username` alias soul via
  `holster.wire.get({'#': soul})` (NOT root-level `.get()` — see the
  standalone-souls rule above), iterates `Object.entries()`, then reads
  each `~pub` node the same way. `epub` lives at the TOP LEVEL of the
  `~pub` node (`create()` writes `{username, pub, epub, auth}`) — the
  alias entry itself is just a `{'#': soul}` rel.
- `readUsername()` reads the logged-in user's profile with the chain read
  `holster.user().get('profile', cb)`, which follows the profile rel.
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

For write/read races in tests: wait for `put` acks (never
fire-and-forget `await chain.put(x)`) and poll reads with
`retryWithBackoff` (`src/lib/retry`) on a real condition — see the
listItems and user-operations tests in `src/test/gunService.test.ts`.
