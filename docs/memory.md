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
- Reference implementations: `src/services/holsterService.ts`

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
reads DO inline rels. Helper: `holsterService.readSoul()`.

The hand-written types in `src/types/holster.ts` mirror the real Holster
API — do NOT loosen them. The GunDB → Holster migration originally
declared `once` and a chain `get`, so `tsc` passed while the app hung
at runtime. Never assume GunDB session/node shapes; verify against the
Holster source.

**Arrays**: NEVER `.put()` an object containing array attributes —
Holster does not support arrays as object properties and this
fundamentally breaks. Store each item as a separate node
(`node.get('docs').next(docId).put(doc)`); read collections with the
full-node + `Object.entries()` pattern above. See
`holsterService.listItems()` in `src/services/holsterService.ts` and
`readPrivateMap()` in `code_references/holster.md` for private data
maps.

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
  `src/types/holster.ts` encoded the wrong GunDB shape and was replaced by
  `AckCallback = (err: string | null | undefined) => void`.)
- `transformAuthError` in `src/stores/authStore.ts` matches on the message
  prefixes `User creation failed` / `Authentication failed` — keep those
  prefixes intact when touching `holsterService.createUser`/`authenticateUser`.
- Wire-layer messages (`wire.get`/`wire.put` raw JSON) ARE objects with
  `put`/`err` fields — that convention applies only to raw wire reads
  (`holsterService.readSoul`), not API callbacks.

# Wedged Local Storage: Hang Signature, Recovery, and Deadlines (2026-09-20)

Holster write acks (`wire.put` → `api.put` → radisk batch/thrash →
IndexedDB) have NO watchdog or timeout anywhere in the library — only
radisk READS recover, after 30s — so this failure mode is still possible
in every 2.x. If IndexedDB wedges (corrupt storage DB,
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
- `withDeadline` (exported from `holsterService`; 45s default, above the
  30s+10s library timeouts) bounds EVERY callback-only Holster operation
  (create/auth, put acks, reads). `initialize()` runs a separate 10s
  storage health probe. Route ANY new Holster read/write that settles
  inside a callback through `withDeadline` (pass
  `relayStatusSummary()` as `getDetails`; it is public for external
  callers such as documentStore). Regression test: the Deadline suite in
  `src/test/holsterService.test.ts`. The timeout rejects a HolsterError
  with code STORAGE_ERROR; the deadline does NOT prove storage is
  wedged — create/auth begin with relay reads, so a down relay trips the
  same deadline. Check the error `details` (live relay states) before
  blaming storage or wiping data.
- Dev builds store to their OWN IndexedDB (`holsterService.storageDbName`
  → Holster `opt.file`, default `radata_dev`; prod `radata`), so tests
  never touch production storage. `initialize(config)` records the
  resolved name on the service, so `clearHolsterStorage()` always targets
  the DB that was actually opened (including a `config.file` override).
  Recovery/clearing below target that DB.
- `clearHolsterStorage()` CANNOT delete the active DB in-page: Holster
  never closes its connection, so `deleteDatabase` is always `onblocked`
  while the app runs. It now defers — logout + localStorage
  `holster.storageClearPending` — and `completePendingStorageClear()`
  (main.tsx, BEFORE `holsterService.initialize()`) deletes it on the next
  load. It returns `StorageClearOutcome` (`deleted`/`deferred`/`error`/
  `unavailable`) instead of resolving void, and a no-IndexedDB env
  discards the pending flag rather than retrying forever. A failed or
  blocked clear means NOT deleted; don't "fix" either path to claim
  success.

# Holster Chains Are Single-Use After a Read (2026-09-21)

A one-shot chain read (`.next(null, cb)` / `.get(key, cb)`) deletes the
chain's context once it delivers data (`holster.js` `done()` calls
`allctx.delete(ctxid)`), and `put()` returns early without one. Reusing
the same chain object for a read and then a put therefore makes the put
silently no-op — its ack never fires and any awaited promise around it
hangs forever. This froze `documentStore` at "4. update the document"
(`docNode` was read, then `.put()`ed); read-only and write-only paths
were unaffected, which is the signature.

- Rule: build a FRESH chain for every read AND every write. Never
  `.put()` on a chain after `.next(null, cb)`/`.get(key, cb)`, and never
  call `.next(key)` twice on the same chain (it accumulates the path).
- Every user-scoped **put** goes through
  `holsterService.buildUserChain(path)` (private) and `putUserPath`, so the
  fresh-chain rule for writes lives in one place; the service private
  reads (`readPrivateData`/`readPrivateMap`) use it too, and every other
  read builds a fresh chain per call. `writeUserPath(path, data,
  description)` is the public plaintext write (never for secret data —
  it does not encrypt) and is deadline-bounded (see Wedged Local Storage
  above). `readOwnDocument`/`writeOwnDocument` in
  `src/stores/documentStore.ts` wrap this for the `docs` collection —
  use `writeOwnDocument` for ALL document writes, including
  `createDocument` (a raw `put` there would skip the deadline).
  Reference: `code_references/holster.md` section 2.

# Relay Status via Socket Tracking; Holster Reconnects Forever (2026-09-22)

Holster's browser client keeps its peer WebSockets in a closure in
`wire.js` and exposes no connection events, no `on('hi')`, and no `opt()`
method — our `HolsterInstance` type used to declare `opt`, which does not
exist (removed). Any `holster.opt(...)` call throws `TypeError`.

- Holster RECONNECTS FOREVER at ~1s: `start()` in `wire.js` creates a NEW
  `createRetryHandler()` on every attempt, so `retryCount` always starts
  at 0 and its `maxRetries`/exponential backoff never apply. Each failed
  attempt also hits `ws.onerror = e => console.log(e)`, so killing the
  relay spams the console and flips status connecting↔disconnected.
- `relayMonitor` wraps `globalThis.WebSocket` (installed in
  `holsterService.initialize()` BEFORE `Holster()`) and tracks the real sockets.
  It also mediates `onopen`/`onclose`: because Holster's close handler
  schedules the next attempt, the monitor DELAYS invoking it with real
  exponential backoff (1s→2s→4s→…→30s cap, reset on open). Do NOT remove
  this gate or Holster will hammer the relay every second.
- NEVER reintroduce throwaway reachability probes. Opening a WebSocket on
  a timer and closing it while CONNECTING spams "WebSocket is closed
  before the connection is established" and leaves half-open sockets;
  that was the cause of the observed long-idle tab lockups.
- Status is READ from the real sockets (`getConnectionState()`/
  `getRelayStatuses()`/`getPeerConnectionTime()`). Recovery happens
  automatically on a backed-off retry; do not fake "Connected" — the
  monitor reports the socket's actual state. The StatusBar still offers a
  manual Reload.

# Holster Sessions Are Not Auto-Persisted: `auth()` ≠ `store()` (2026-09-22)

`user().auth()` only sets the in-memory `user.is`; it NEVER touches
localStorage/sessionStorage. Persistence is a separate explicit call:
`user().store(true)` writes `user.is` to localStorage (`store()` /
`store(false)` uses sessionStorage). `user().recall()` is SYNCHRONOUS and
restores `user.is` from localStorage first, then sessionStorage;
`user().leave()` nulls `user.is` and removes both persisted copies.

- Consequence: a startup `recall()` that is never preceded by a successful
  `store()` silently restores nothing (`recall()` returns immediately with
  `user.is` unchanged). If session restore appears broken, check for a
  `store()` call before adding delays/retries or blaming Holster.
- Do NOT hand-write `user.is` to storage or assume `auth()` persists it;
  `store()` is the whole persistence API
  (`node_modules/@mblaney/holster/src/user.js`).
- Where persistence lives: `holsterService.authenticateUser()` calls
  `user().store()` (sessionStorage) on auth success — the single choke
  point for both login and register (register runs `createUser` then
  `authenticateUser`; `createUser` alone leaves `user.is` null, so it is
  NOT a valid place to persist). `checkSession()` `recall()`s it on
  startup and `logout()` → `leave()` clears it. sessionStorage means a
  refresh survives but closing the tab/window logs the user out; use
  `store(true)` (localStorage) only if cross-restart persistence is
  wanted.

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
`SEAInstance` in `src/types/holster.ts`):

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
  node (fixed in `holsterService.getPrivatePathPart`). The `salt` argument
  must ALSO be a scalar: pass `sea.epriv`, not the whole `user.is`/pair
  object, or `SEA.work` stringifies it to that same literal
  `'[object Object]'` for every user — all users then derive identical
  hashes for a path and node-name privacy is lost (fixed in
  `getPrivatePathPart`).
- `SEA.secret()` takes `{epub}`, never a bare epub string (returns
  null otherwise).
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
`src/types/holster.ts`; `src/types/holster-package.d.ts` declares only a loose
default export.

# User Profiles & Discovery: the `~@username` Alias Index (2026-09-18)

Holster maintains a `~@username` alias index natively: `user().create()`
writes `{pub: {'#': '~pub'}}` entries under `~@username` (usernames are
NOT unique — `create()` rejects a username whose alias already exists, so
duplicates normally need a partitioned/concurrent graph, but the alias can
map to multiple pubs), and `user().auth()` reads
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
  of pubs claiming that username. Use `holsterService.discoverUsers()`.

Reference implementations for the Holster/SEA patterns — user
create/auth, profiles/discovery, private data, plaintext writes,
contacts — live in `code_references/holster.md`; it documents reusable
patterns, not every `holsterService` method.

# Functional Result Utility (2026-09-18)

Type-safe error handling lives in the `@k98kurz/functional-result` npm
package (agent skill: `.opencode/skills/functional-result`). Use it for
operations that may fail; prefer predictable error types and composable
operations.

- `pipe` (and `flow`) are for composing MULTIPLE operations. Never wrap
  a single operation in `pipe`.
- A helper that RETURNS `Promise<Result<...>>` does not throw on failure.
  `await`-ing it and ignoring the result silently treats failure as
  success — check `.success` and surface `.error`. (`writeProfile`
  previously swallowed a failed `writeUserPath` this way, making
  registration succeed without writing a profile.)
- In pipelines, check each Result and short-circuit before the next
  operation (see `authStore.register`); `await`-ing several operations
  into an array and passing them to `sequence` runs ALL of them before
  any failure check.
- If a `transformError` helper is needed, write it ONCE per file —
  never re-declare it at every call site.
- Real-world usage: `src/stores/authStore.ts`.

# updateDocument: Encrypt Only Caller-Provided Fields (2026-09-22)

Stored `title/content/tags` on a private doc are CIPHERTEXT. In
`documentStore.updateDocument`, never feed fallback values from `doc.*`
into `encrypt()` — re-encrypting ciphertext corrupts the document, and
`csvToArray` later shreds the cipher JSON on commas. Gate each encrypt on
field presence (`titleProvided`/`contentProvided`; `tags` uses
`Object.prototype.hasOwnProperty`, not `Object.hasOwn` — lib target is
ES2020). Contract: a present `tags` key sets tags, `tags: undefined`
clears, key absent keeps. `DocumentEditor.tsx` sends `tags: undefined`
when the user clears tags — do not "simplify" that ternary away; the
store treats it as an explicit clear. Regression tests:
`testUpdateDocumentPartial` in `src/test/documentStore.test.ts`.

# Testing (2026-09-22)

`npm test` runs the existing `TestRunner` suites headless under vitest in Node.
The old claim that "Holster auth/user flows do not work in node" is obsolete:
Holster has a real Node path (`store.js` uses `node:fs`; `wire.js` imports
`ws`). User-facing setup is in readme.md.

Never fork the suite logic into a second copy. `src/test/vitest/suites.vitest.ts`
is the only bridge: it initializes `holsterService` with a per-run temp `file`
and `indexedDB: false`, calls the exported suite functions, and requires each
returned `TestSuiteResult` to report zero failures. Supporting invariants:

- vitest collects only `src/test/vitest/**/*.vitest.ts`, so suites must be
  IMPORTED by the bridge, not left where vitest would collect them directly.
- `src/test/setup.ts` shims web storage and points `relaySettings` at the
  spawned test relay, so no run can reach the default/prod relay.
- The relay and client storage use per-run temp dirs, so runs repeat with no
  manual clearing. The test relay binds IPv4 loopback only (127.0.0.1), and the
  run preflights the port before spawning: override it with
  `MMW_TEST_RELAY_PORT` (default 8787), and an occupied port fails loudly.
- Node needs no jsdom, `fake-indexeddb`, or explicit `WebSocket`
  (`crypto.subtle` is built in).

Caveats:

- `compareTwoThings` (documentStore.test.ts) only checks array length when
  `expected` is the TOP-LEVEL argument; a nested `{ tags: [] }` vacuously
  passes (the element loop runs zero times). Compare empty arrays as
  `compareTwoThings([], actual, msg)`.
- Browser tooling is unchanged: `window.runAllTests()` and `window.testX()`
  still work in dev mode.

No artificial delays, ever: Holster loads SYNCHRONOUSLY from local
storage/cache, so there is nothing to "wait for". Delays added before
`.next(null, cb)`/`.get(key, cb)` or after
`await holsterService.authenticateUser(...)` only mask broken read code
(usually GunDB-style `.get(cb)`/`.once()` calls — see the Holster Read
API entry above). The harness adds no wait-for-data delays (it only
waits for the relay process to exit during teardown) — keep it that
way. For write/read races: wait for `put` acks (never fire-and-forget
`await chain.put(x)`) and poll reads with `retryWithBackoff`
(`src/lib/retry`) on a real condition — see the listItems and
user-operations tests in `src/test/holsterService.test.ts`.

Browser storage clearing is deferred to the next page load (see Wedged
Local Storage above); the Node run needs none of it (per-run temp dirs).

# Doc-Key Transitions: Envelope Before Ciphertext (2026-09-22)

The `['docKeys', docId]` private slot holds a plain key string in steady
state. During `changeDocumentKey` it holds JSON
`{v: 1, active, pending}`, written BEFORE the doc is re-encrypted and
collapsed back to the plain new key only AFTER the new ciphertext is
acked. Neither plain order works: key-first strands old-key ciphertext,
doc-first stores ciphertext no slot value can decrypt. Governing rule:
never destroy or overwrite the only decryptability material until the
replacement representation is durable.

- `resolveDocumentKey(docId, doc)` (documentStore.ts) is the ONLY reader
  of this slot. Plain values return untouched (no probe); envelope
  candidates are probed against the stored title. It is READ-ONLY —
  never heals or collapses on read, so a crashing transition cannot race
  a healing write. Never add a raw `readPrivateData(['docKeys', ...])`
  call.
- `setDocumentPublic`: plaintext doc write FIRST, key delete LAST (failed
  doc write stays recoverable; a failed delete only orphans a key).
  Key-first remains correct for `setDocumentPrivate`/`createDocument` —
  the doc is plaintext beforehand, so failure only orphans a key; doc
  first would store ciphertext with no key.
- Tests: `testKeyTransitions` in `src/test/documentStore.test.ts`. The
  privacy actions gate on `useAuthStore.user`, which `setupTestUser`
  never sets — tests mirror it via `useAuthStore.setState({ user:
  holster.user() })` around the gated calls.

# SEA.decrypt Auto-Parses JSON-Looking Plaintext (2026-09-22)

Holster's `SEA.decrypt` runs `JSON.parse` over the decrypted text
(`sea-utils.parse`: parse-or-return-raw), so any JSON-STRING payload
written via `writePrivateData` comes back as an OBJECT — despite
`readPrivateData`'s declared `string` return. Even scalar JSON
(`123`, `{"a":1}`) comes back re-serialized, so round-trips are not
byte-identical. Calling `.startsWith`/
`.split` on it then throws `TypeError` (surfacing far away as whatever
the caller's catch maps it to — cost an hour while debugging the
doc-key envelope).

- String-typed SEA wrappers MUST normalize after decrypt:
  `typeof v === 'string' ? v : JSON.stringify(v)` — done in
  `encryptionService.decrypt` and `holsterService.readPrivateData`
  (also fixes `readPrivateMap`, which delegates to it). Any new wrapper
  over `SEA.decrypt` needs the same line.
- Symptom signature: the value `console.log`s as a multi-line object
  tree with single-quoted strings (Node inspect) instead of one line.
