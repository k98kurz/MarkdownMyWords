# Holster Read API, Arrays, and Session Shape (2026-09-18)

Holster's chain API is exactly `next`, `put`, `on`, `off`. There is NO
`.once()` and NO `.get(cb)` on chains — `chain.get(cb)` silently never
fires (`holster.get('x').get(cb)` hangs forever) and `chain.get(key)`
after the first link re-roots the chain at `root/<key>` and reads the
WRONG node (`holster.get('p').get('c', cb)` returns `null`).

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
null for them. Retries/timeouts can't fix a read that can never
succeed. Read standalone souls via the wire spec:
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
never populates `user._`, so reading it returns `undefined` and every
private-data write fails with "User cryptographic keypair not
available"). Always get the pair via `getUserSEA()` in
`src/misc/seaHelpers.ts`, which reads `user.is`.

# Holster Callbacks Are Node-Style: String Errors, Never Object Acks (2026-09-20)

Holster's `user().create()`, `user().auth()`, and chain `.put()` callbacks
follow the Node convention: the argument is a plain STRING error message
(`"Username already exists"`, `"Wrong username or password"`, `"error ..."`)
or `null`/`undefined` on success. There is NO GunDB-style `{err: "..."}`
object ack anywhere (verified in
`node_modules/@mblaney/holster/src/user.js` and `holster.js`).

- Error check is TRUTHINESS: `if (ack) reject(...)` — never
  `typeof ack === 'object' && ack.err`. The `{err}`-shaped check
  silently converts EVERY error into success. (`GunAck` in
  `src/types/gun.ts` encoded the wrong GunDB shape and was replaced by
  `AckCallback = (err: string | null | undefined) => void`.)
- `transformAuthError` in `src/stores/authStore.ts` matches on the message
  prefixes `User creation failed` / `Authentication failed` — keep those
  prefixes intact when touching `gunService.createUser`/`authenticateUser`.
- Wire-layer messages (`wire.get`/`wire.put` raw JSON) ARE objects with
  `put`/`err` fields — that convention applies only to raw wire reads
  (`gunService.readSoul`), not API callbacks.

# Wedged Local Storage: Hang Signature, Recovery, and Deadlines (2026-09-20)

Holster write acks (`wire.put` → `api.put` → radisk batch/thrash →
IndexedDB) have NO watchdog or timeout anywhere in the library — only
radisk READS have the 30s "radisk read hang detected" recovery, and the
write-path watchdogs are still unfixed upstream in every 2.x, so the
failure mode remains possible. If IndexedDB wedges (corrupt storage DB,
`dbReady` bootstrap dying silently inside `onsuccess`, blocked
`indexedDB.open`, pending `deleteDatabase`), every read costs 30s and
every write's ack NEVER arrives: `user().create()` never calls back,
and the `creating` flag stays `true`, so later create attempts fail
fast with "User is already being created" — a test run frozen in
"beginning test Create user" with one watchdog message for `~@alias␅`
is this signature.

- Recovery: wipe BOTH stores — browser IndexedDB (the configured
  `STORAGE_DB_NAME`, DevTools → Application) after closing other tabs +
  hard reload, AND the relay's `./radata` directory (Node fs store,
  written by the same radisk). Test users are disposable; never try to
  salvage these stores.
- `gunService.withDeadline` (45s, above the 30s+10s library timeouts)
  bounds `createUser`/`authenticateUser`/`writeProfile`/private-data
  put waits, and `initialize()` runs a 10s storage health probe — a
  wedge now fails loudly with the recovery instructions instead of
  freezing a test suite. Keep those wrappers (passing
  `relayStatusSummary()` as timeout details) on any new Holster
  write/auth path. The timeout rejects a GunError with code
  STORAGE_ERROR; the deadline does NOT prove storage is wedged —
  create/auth begin with relay reads, so a down relay trips the same
  deadline. Check the error `details` (live relay states) before
  blaming storage or wiping data.
- Dev builds store to their OWN IndexedDB (`gunService.storageDbName`
  → Holster `opt.file`, default `radata_dev`; prod `radata`), so tests
  never touch production storage. `initialize(config)` records the
  resolved name on the service, so `clearHolsterStorage()` always targets
  the DB that was actually opened (including a `config.file` override).
  Recovery/clearing below target that DB.
- `clearHolsterStorage()` CANNOT delete the active DB in-page: Holster
  never closes its connection, so `deleteDatabase` is always `onblocked`
  while the app runs. It now defers — logout + localStorage
  `holster.storageClearPending` — and `completePendingStorageClear()`
  (main.tsx, BEFORE `gunService.initialize()`) deletes it on the next
  load. It returns `StorageClearOutcome` (`deleted`/`deferred`/`error`/
  `unavailable`) instead of resolving void, and a no-IndexedDB env
  discards the pending flag rather than retrying forever. A failed or
  blocked clear means NOT deleted; don't "fix" either path to claim
  success.

# SEA Encryption & ECDH for Document Sharing (2026-09-18)

Documents are encrypted with `SEA.encrypt` using per-document symmetric
keys; keys are shared between users with SEA's built-in ECDH. NEVER
reimplement encryption, authentication, or key exchange. Use the
sender's EXISTING pair from `user.is` (via `getUserSEA()` — see
Session shape above) and the recipient's existing encryption epub from
the contacts list. NEVER generate ephemeral key pairs for ECDH; NEVER
use a public key as an encryption key or passphrase.
`encryptionService` handles document encryption and key sharing.

```typescript
// CORRECT: per-document symmetric keys via encryptionService
const docKey = await encryptionService.generateKey();
const encrypted = await encryptionService.encrypt(content, docKey);

// CORRECT: SEA's ECDH shares document KEYS (not documents themselves)
// NOTE: e in epub/epriv stands for "encryption", not "ephemeral"
const sharedSecret = await SEA.secret({ epub: recipientEpub }, getUserSEA(user));
const encryptedKey = await SEA.encrypt(docKey, sharedSecret);

// INCORRECT: ECDH with fresh key pairs
const ephemeralPair = await SEA.pair();
const sharedSecret = await SEA.secret({ epub: recipientPub }, ephemeralPair); // WRONG

// INCORRECT: public key used directly as encryption key
const encrypted = await SEA.encrypt(data, user.pub); // WRONG
```

Earlier agents generated ephemeral key pairs, used public keys as
passphrases, and bypassed SEA's automatic encryption/decryption —
creating real security holes. These rules are absolute; don't touch
any of this without a human.

# Holster SEA Object Shapes (2026-09-18)

Holster's SEA (`node_modules/@mblaney/holster/src/sea.js`) is NOT Gun's
string-based SEA. Code written against Gun's API compiles if types are
loose but fails at runtime. Rules (mirrored by `SEACipher`/`SEAPair`/
`SEAInstance` in `src/types/gun.ts`):

- Keys must be OBJECTS: `SEA.encrypt(data, {epriv: keyString})`. A bare
  string key hits the `!pair.epriv` guard and returns null. (This is
  why `generateKey()` works — it uses raw WebCrypto, not SEA.)
- `SEA.encrypt` returns a cipher OBJECT `{ct, iv, s}` (base64 fields),
  never a string. To store as a string, `JSON.stringify` it; parse
  before decrypt. `encryptionService.encrypt/decrypt` do this — keep
  their string-in/string-out API.
- Failure sentinel is `null` (encrypt's key guard AND decrypt's
  wrong-key path), never `undefined`. Check falsy/null — a
  `=== undefined` check turns failures into `success(null)` and
  silently corrupts data.
- `SEA.work()` and `SEA.secret()` return `{epriv}` pair objects.
  Extract `.epriv` for hashed path strings — returning the whole
  object as a path makes Holster coerce it with `String(key)` to the
  literal `'[object Object]'`, colliding every private path into one
  node (fixed in `gunService.getPrivatePathPart`).
- `SEA.secret()` takes `{epub}`, never a bare epub string (returns
  null otherwise).
- `SEA.decrypt` runs `utils.parse` on plaintext: plaintext that is
  itself valid JSON (`123`, `{"a":1}`) comes back re-serialized, so
  round-trips are not byte-identical. The service coerces non-strings
  back with `JSON.stringify`.
- Cipher values read back from nodes carry extra `_` graph metadata;
  validate with `isSEACipher()` (`src/misc/seaHelpers.ts`), which
  checks for ct/iv/s fields.
- Hard size cap: decrypt is the binding limit — `SafeBuffer.from(ct,
  "base64")` (sea.js) rejects ciphertext base64 strings over 1 MiB
  chars (~786 KB plaintext) and throws the RangeError OUTSIDE
  `SEA.decrypt`'s try/catch, so it rejects instead of returning null.
  `encryptionService` pre-checks `MAX_PLAINTEXT_BYTES` (786,000) and
  fails with a clear ENCRYPTION_FAILED message. If large documents are
  ever needed, chunking belongs at the service layer; multi-MB Holster
  values hit storage/relay limits anyway.

The legacy GunDB string-SEA surface (`code_references/holster.d.ts`,
`code_references/testNewGunSEAScheme.ts`) is historical only — do not
use either as a reference. The real API types live in
`src/types/gun.ts`; `src/types/holster.d.ts` declares only a loose
default export.

# User Profiles & Discovery: the `~@username` Alias Index (2026-09-18)

Holster maintains a `~@username` alias index natively: `user().create()`
writes `{pub: {'#': '~pub'}}` entries under `~@username` (usernames are
NOT unique — the alias maps to multiple pubs), and `user().auth()` reads
that index to find candidate pubs. The alias index IS the directory
mechanism — do not invent a "profiles directory" node.

- App-level profile data lives at `holster.user().get('profile')`
  (soul `~pub/profile`), written by `writeProfile()`.
- Discovery (`discoverUsers()`) reads the `~@username` alias soul and
  each `~pub` node via wire reads (NOT root-level `.get()` — these are
  standalone souls, see the Read API entry above), iterating with
  `Object.entries()`. `epub` lives at the TOP LEVEL of the `~pub` node
  (`create()` writes `{username, pub, epub, auth}`) — the alias entry
  itself is just a `{'#': soul}` rel.
- `readUsername()` reads the logged-in user's profile with the chain
  read `holster.user().get('profile', cb)`, which follows the profile
  rel.
- NEVER treat `~@username` as resolved profiles — it is an alias index
  of pubs claiming that username. Use `gunService.discoverUsers()`.

Complete current implementations (`createUser`, `authenticateUser`,
`writeProfile`, `discoverUsers`, `writePrivateData`/`readPrivateData`/
`readPrivateMap`, contacts): `code_references/holster.md`.

# Functional Result Utility (2026-09-18)

Type-safe error handling lives in `src/lib/functionalResult.ts`. Use it
for operations that may fail; prefer predictable error types and
composable operations.

- `pipe` (and `flow`) are for composing MULTIPLE operations. Never wrap
  a single operation in `pipe`.
- In pipelines, check each Result and short-circuit before the next
  operation (see `authStore.register`); `await`-ing several operations
  into an array and passing them to `sequence` runs ALL of them before
  any failure check.
- If a `transformError` helper is needed, write it ONCE per file —
  never re-declare it at every call site.
- Real-world usage: `src/stores/authStore.ts`; comprehensive examples:
  `src/test/functionalResult.test.ts`.

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
API entry above). Exponentially increasing delays have been tried
repeatedly; it never works. Use callbacks, not delays.

For write/read races in tests: wait for `put` acks (never
fire-and-forget `await chain.put(x)`) and poll reads with
`retryWithBackoff` (`src/lib/retry`) on a real condition — see the
listItems and user-operations tests in `src/test/gunService.test.ts`.

Clearing local storage is deferred, not immediate: `clearHolsterStorage()`
flags a pending clear that `completePendingStorageClear()` performs on the
next page load (before Holster initializes). Don't call it expecting an
in-run wipe — clear + reload is a separate step before `runAllTests()`.
