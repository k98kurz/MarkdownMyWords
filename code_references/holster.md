# Holster + SEA

This is the definitive reference for using Holster and SEA in this application.
All patterns and examples have been validated through implementation.

## 0. General Principles and Notes

- Users are created with `holster.user().create(user, pass)`
- Users log in with `holster.user().auth(user, pass)`
- Data that can be changed by anyone is accessed with
  `holster.get('node-name').put('some data')`
- Data that can only be changed by the current user is stored with
  `holster.user().get('node-name').put('data')`
- Data that is secret to the user is encrypted with
  `SEA.encrypt(plaintext, getUserSEA(holster.user()))` before being stored
  (the SEA key pair lives on `user.is` — {username, pub, epub, priv, epriv} —
  there is NO `user._.sea` like GunDB)
- To maintain privacy of node names, they must be hashed first, with a
  per-user scalar salt, but this makes reading them impossible (see section 6)
- Holster is initialized with
  `import Holster from '@mblaney/holster/src/holster.js'` and
  `Holster({peers, indexedDB: true})` — the package publishes no root `index.js`,
  so the deep `src/holster.js` path is the only import that resolves
- Sessions are NOT persisted automatically: `user().auth()` only sets the
  in-memory `user.is`. Call `user().store(true)` to persist it to
  localStorage (or `user().store()` for sessionStorage), `user().recall()`
  (synchronous) to restore it on startup, and `user().leave()` to clear both
  `user.is` and the persisted copy
- Examples below use the repo's Holster types from `src/types/holster.ts`
  (`HolsterInstance`, `HolsterUserNode`, `SEAInstance`, `SEAPair`, `WireMessage`,
  `AckCallback`) instead of `any`, per AGENTS.md

## 1. Setup & Initialization

```typescript
import Holster from '@mblaney/holster/src/holster.js';

// Initialize Holster with peers and IndexedDB
const holster = Holster({
  peers: [
    'ws://localhost:8765',
    'wss://relay.markdownmywords.com/gun'
  ],
  indexedDB: true,
});

// Get SEA instance from holster
const SEA = holster.SEA;

// Connection monitoring: Holster exposes NO peer connection events and no
// public reconnect API — its browser client creates peer WebSockets inside a
// closure in wire.js. The only way to report the REAL relay state is to
// observe those sockets directly. holsterService installs relayMonitor
// (src/services/relayMonitor.ts) BEFORE constructing Holster; the monitor
// wraps window.WebSocket, passively tracks open/close per configured relay,
// and backs holsterService.getConnectionState()/getRelayStatuses()/
// getPeerConnectionTime().
//
// Do NOT "probe" reachability with throwaway sockets: opening a new WebSocket
// every interval and closing it while still CONNECTING spams "WebSocket is
// closed before the connection is established" and leaves half-open sockets
// behind. Holster's client retries FOREVER at ~1s: wire.js's start()
// creates a new createRetryHandler() on every attempt, so its maxRetries and
// exponential backoff never apply. relayMonitor delays Holster's onclose
// handler to enforce real backoff (1s→2s→4s→…→30s cap, reset on open).
```

**Note**: Holster uses WebSocket protocol (`ws://` or `wss://`) for peer URLs. HTTP/HTTPS URLs must be converted to WebSocket protocol.

## 2. CRUD Patterns

### Write Operations

```typescript
// Simple write
holster.get('node-name').put('some data', (err) => {
  if (err) {
    console.error('Write failed:', err);
  } else {
    console.log('Write succeeded');
  }
});

// Write object
holster.get('node-name').put({key: 'value', count: 42}, (err) => {
  if (err) {
    console.error('Write failed:', err);
  }
});
```

**Arrays are NOT supported**: never `put()` an object with an array property
— Holster silently breaks on arrays. Store each item as its own node
(`node.get('docs').next(docId).put(doc)`) and read collections with the
full-node + `Object.entries()` pattern in section 3. See docs/memory.md
("Arrays").

### Read Operations

```typescript
// Single read at root level (key + callback)
holster.get('node-name', (data) => {
  if (data === undefined) {
    console.log('Node not found');
  } else {
    console.log('Node data:', data);
  }
});

// Read with path traversal
holster.get('level1').next('level2').next('level3').next(null, (data) => {
  console.log('Nested data:', data);
});
```

**Note**: Single reads use the callback overloads: `.get(key, cb)` at root/user
level, `.next(key, cb)` for a chain child, `.next(null, cb)` for the current
chain node. GunDB's `.once(cb)` does not exist in Holster.

**CRITICAL**: `.once()` does not exist in Holster, and `.get(cb)` does not work
on chains. The chain methods are `next`, `put`, `on`, `off` (plus `user`, `wire`,
`SEA`; the returned object also has a `get`, but calling it re-roots the chain
rather than reading it — see `node_modules/@mblaney/holster/src/holster.js`).
Verified empirically:
`holster.get('x', cb)` fires, `holster.get('x').get(cb)` never fires, and
`holster.get('p').get('c', cb)` reads the wrong node (root-level `c`). Calling
`.once(cb)` throws `TypeError: node.once is not a function` at runtime. The
types in `src/types/holster.ts` mirror the real API so TypeScript catches misuse.

**CRITICAL — standalone souls**: root-level `.get(key, cb)` reads only
PROPERTIES of the `root` soul (following rels). Souls written directly by
`user().create()` — `~pub` (user node) and `~@username` (alias index) — are
standalone graph souls, NOT root properties, so `.get('~@username', cb)`
ALWAYS calls back `null`. Read them via the wire spec (what `user().auth()`
does internally):

```typescript
holster.wire.get({'#': soul}, msg => {
  const node = msg.put && msg.put[soul]; // object, or null if absent
});
```

Raw wire reads do NOT inline rels — rel properties arrive as `{'#': soul}`
and must be followed with further wire reads. Chain reads (`.get(key, cb)`
on a real property, `.next(...)`) DO inline rels.

### User-Scoped Writes: Fresh Chains and Deadlines (CRITICAL)

**Build a FRESH chain for every read AND every write.** A one-shot chain
read (`.next(null, cb)` / `.get(key, cb)`) deletes the chain's context once
it delivers data (`holster.js` `done()` calls `allctx.delete(ctxid)`), and
`put()` returns early without one. Reusing a chain object for a read and
then a put makes the put silently no-op — its ack never fires and any
awaited promise around it hangs forever. Never `.put()` on a chain after
`.next(null, cb)`/`.get(key, cb)`, and never call `.next(key)` twice on the
same chain (it accumulates the path).

Every user-scoped plaintext write goes through
`holsterService.writeUserPath(path, data, description)`, which builds a fresh
chain and bounds the ack wait with `withDeadline` (a wedged storage layer
fails loudly with live relay state in `details` instead of hanging):

```typescript
// Fresh chain + deadline. Write-only — never put after a read.
const result = await holsterService.writeUserPath(
  ['docs', docId],
  documentForStorage,
  'Failed to save document'
);
if (!result.success) throw result.error;
```

**Plaintext only**: `writeUserPath` does NOT encrypt. Never route secret
data through it — private data goes through `writePrivateData` (section 6),
which hashes the path and encrypts the value. In `documentStore`, the
`writeOwnDocument` helper wraps `writeUserPath` for the `docs` collection;
`readOwnDocument` builds its own fresh read chain. All service user-scoped
**writes** — plaintext and private — build chains via `buildUserChain` and
write via `putUserPath`, so the fresh-chain rule for writes lives in one
place. Private reads also use `buildUserChain`; other reads
(`readOwnDocument`, `readUsername`) build a fresh chain per call.

## 3. Collection Iteration

Holster does not use `.map()` like GunDB. Instead, read the full node and iterate with `Object.entries()`:

```typescript
// List all items in a collection
holster.get('collection-name', (data) => {
  if (!data || typeof data !== 'object') {
    console.log('Collection is empty or invalid');
    return;
  }

  const items = Object.entries(data || {})
    .filter(([k, v]) => k !== '_' && v != null)
    .map(([soul, itemData]) => ({
      soul,
      data: itemData,
    }));

  console.log('Collection items:', items);
});
```

**Important**: No timeout is needed with Holster's `.get()` pattern, unlike GunDB's `.map()` approach.

## 4. User Creation, Authentication, and Profile Storage

```typescript
async function createUser(
  holster: HolsterInstance,
  username: string,
  password: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    holster.user().create(username, password, err => {
      if (err) {
        reject(new Error(`User creation failed: ${err}`));
      } else {
        resolve();
      }
    });
  });
}

async function authenticateUser(
  holster: HolsterInstance,
  username: string,
  password: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    holster.user().auth(username, password, err => {
      if (err) {
        // Reject via the executor — throwing inside this callback would
        // neither reject the promise nor surface the error.
        reject(new Error(`Authentication failed: ${err}`));
        return;
      }
      resolve();
    });
  });
}

async function writeProfile(holster: HolsterInstance): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const userNode = holster.user();
    const userState = userNode.is;

    if (!userState?.epub) {
      reject(new Error('User session not available'));
      return;
    }

    const profileData: { epub: string; username?: string } = {
      epub: userState.epub,
    };

    if (userState.username && typeof userState.username === 'string') {
      profileData.username = userState.username;
    }

    userNode.get('profile').put(profileData, err => {
      if (err) {
        reject(new Error(`Profile storage failed: ${err}`));
      } else {
        resolve();
      }
    });
  });
}

async function register(
  holster: HolsterInstance,
  username: string,
  password: string
) {
  // in this order on registration
  await createUser(holster, username, password);
  await authenticateUser(holster, username, password);
  await writeProfile(holster);
}

// for login just use authenticateUser
```

**Note**: Profile data is stored at `user().get('profile')` (the `~pub/profile`
property) instead of directly on the user node as in GunDB.

### Authentication Session

`user().auth()` sets `user.is` in memory only. Persist and restore it
explicitly:

```typescript
// Persist the session. store(true) => localStorage, store() => sessionStorage.
holster.user().store(true);

// Restore a persisted session on app start. recall() is SYNCHRONOUS: it
// reads localStorage, then sessionStorage, into user.is before returning.
holster.user().recall();
const session = holster.user().is;
if (session?.pub) {
  // Authenticated; user.is = {username, pub, epub, priv, epriv}
}

// Sign out: clears user.is and the persisted copy.
holster.user().leave();
```

**CRITICAL**: `auth()` does not call `store()`. A startup `recall()` that is
never preceded by `store()` silently restores nothing.

In this app, `holsterService.authenticateUser()` calls `store()` (sessionStorage)
on auth success, so a page refresh restores the session but closing the
tab/window does not. `store(true)` (localStorage) would persist across
browser restarts instead.

## 5. User Profile Discovery

Users who all claim a specific username can be found with the following.
Usernames are NOT unique: the `~@username` alias index maps one alias to
many `~pub` souls. `create()` rejects a username whose alias already exists,
so duplicates normally require a partitioned or concurrently-written graph —
but discovery must still handle many pubs per alias. The alias index is a
standalone soul (see the standalone souls warning in section 2 — root-level
`.get()` cannot read it), so discovery uses wire-spec reads. Each alias entry
is a `{'#': '~pub'}` rel; the `~pub`
user node carries `{username, pub, epub, auth}` at its TOP level (written by
`user().create()`).

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Reads a standalone soul via the wire spec; returns null if absent.
async function readSoul(
  holster: HolsterInstance,
  soul: string
): Promise<Record<string, unknown> | null> {
  return new Promise(resolve => {
    holster.wire.get({'#': soul}, (msg: WireMessage) => {
      const node = msg.put?.[soul];
      resolve(isRecord(node) ? node : null);
    });
  });
}

async function discoverUsers(holster: HolsterInstance, username: string) {
  const aliasNode = await readSoul(holster, `~@${username}`);
  if (!aliasNode) return [];

  // The graph layer (ham.js) enforces that alias entries are
  // self-identifying rels, so every non-`_` key is a `~pub` soul.
  const pubSouls = Object.keys(aliasNode).filter(key => {
    if (key === '_') return false;
    const value = aliasNode[key];
    return isRecord(value) && typeof value['#'] === 'string';
  });

  const profiles = await Promise.all(
    pubSouls.map(async pubSoul => {
      const userNode = await readSoul(holster, pubSoul);
      if (!userNode) return null;
      return {
        pub: pubSoul.startsWith('~') ? pubSoul.slice(1) : pubSoul,
        data: {
          username: typeof userNode.username === 'string' ? userNode.username : undefined,
          pub: typeof userNode.pub === 'string' ? userNode.pub : undefined,
          epub: typeof userNode.epub === 'string' ? userNode.epub : undefined,
        },
      };
    })
  );
  return profiles.filter(profile => profile !== null);
}
```

The typed service implementation lives in `holsterService.discoverUsers()`
(`DiscoveredUser.data` is the resolved user node). For the logged-in
user's own profile, use the chain read
`holster.user().get('profile', cb)`, which follows the profile rel.

## 6. Private User Data

To write data in an absolutely private way, the node name must be hashed, and
the data encrypted using SEA's encrypt/decrypt methods:

- `SEA.work(data, salt)` returns an `{epriv}` pair object — `.epriv` is the
  hashed path string. `salt` MUST be a scalar (use `sea.epriv`): passing the
  whole `user.is`/pair object makes `SEA.work` stringify it via `TextEncoder`
  to the literal `'[object Object]'`, so every user derives the SAME hash for
  a given path and node-name privacy is lost. Never return the whole object
  as a path either: Holster coerces path keys via `String(key)`, so an object
  path becomes the literal string `'[object Object]'` and every private path
  collides into one node.
- `SEA.encrypt(data, pair)` requires a key object with `epriv` (a bare
  string key returns null) and returns a cipher OBJECT `{ct, iv, s}` — that
  object is what you `put()`. `SEA.decrypt(cipher, pair)` returns `null` on
  a wrong key.

```typescript
async function getPrivatePathPart(
  holster: HolsterInstance,
  plainPath: string
): Promise<string> {
  // Holster stores the SEA pair on user.is, not user._.sea
  const sea = getUserSEA(holster.user());
  if (!sea) {
    throw new Error('User cryptographic keypair not available');
  }

  // Salt must be a scalar — the whole pair object stringifies to
  // '[object Object]', making the hash identical for every user.
  const result = await holster.SEA.work(plainPath, sea.epriv);
  if (!result || !result.epriv) {
    throw new Error('Failed to hash path part');
  }
  // SEA.work returns an {epriv} pair object; .epriv is the hashed string.
  return result.epriv;
}

async function getPrivatePath(
  holster: HolsterInstance,
  plainPath: string[]
): Promise<string[]> {
  return await Promise.all(
    plainPath.map(async (p: string) => await getPrivatePathPart(holster, p))
  );
}

async function writePrivateData(
  holster: HolsterInstance,
  plainPath: string[],
  plaintext: string
): Promise<void> {
  const privatePath = await getPrivatePath(holster, plainPath);
  const [firstWrite, ...restWrite] = privatePath;
  let node = holster.user().get(firstWrite);
  for (const part of restWrite) {
    node = node.next(part);
  }

  const sea = getUserSEA(holster.user());
  if (!sea) {
    throw new Error('User cryptographic keypair not available');
  }

  const ciphertext = await holster.SEA.encrypt(plaintext, sea);
  if (!ciphertext) {
    throw new Error('SEA.encrypt failed: returned null');
  }

  await new Promise<void>((resolve, reject) => {
    node.put(ciphertext, err => {
      if (err) {
        reject(new Error(`Failed to write private data: ${err}`));
      } else {
        resolve();
      }
    });
  });
}

// Delete by putting null at the hashed path.
async function deletePrivateData(
  holster: HolsterInstance,
  plainPath: string[]
): Promise<void> {
  const privatePath = await getPrivatePath(holster, plainPath);
  const [firstDelete, ...restDelete] = privatePath;
  let node = holster.user().get(firstDelete);
  for (const part of restDelete) {
    node = node.next(part);
  }

  await new Promise<void>((resolve, reject) => {
    node.put(null, err => {
      if (err) {
        reject(new Error(`Failed to delete private data: ${err}`));
      } else {
        resolve();
      }
    });
  });
}

async function readPrivateData(
  holster: HolsterInstance,
  plainPath: string[],
  hashedPath?: string[]
): Promise<string> {
  const path = hashedPath ?? (await getPrivatePath(holster, plainPath));
  const [firstRead, ...restRead] = path;
  let node = holster.user().get(firstRead);
  for (const part of restRead) {
    node = node.next(part);
  }

  return await new Promise<string>((resolve, reject) => {
    node.next(null, async ciphertext => {
      // SEA.encrypt stored a {ct, iv, s} cipher object (plus Holster's `_`
      // graph metadata on read-back) — validate the shape, not the type.
      if (ciphertext === undefined || !isSEACipher(ciphertext)) {
        reject(new Error('Private data not found or could not be decrypted'));
        return;
      }
      const sea = getUserSEA(holster.user());
      if (!sea) {
        reject(new Error('User cryptographic keypair not available'));
        return;
      }
      const plaintext = await holster.SEA.decrypt<string>(ciphertext, sea);
      if (plaintext === null || plaintext === undefined) {
        reject(new Error('Private data not found or could not be decrypted'));
        return;
      }
      resolve(plaintext);
    });
  });
}

/**
 * Read private structured data (like contacts) by iterating keys and accessing fields
 * Unlike discoverUsers which reads unencrypted data, here we must:
 * 1. First get the keys from the collection
 * 2. Then access each field at privatePath + [key] + [hashedFieldName]
 */
async function readPrivateMap(
  holster: HolsterInstance,
  plainPath: string[],
  fields: string[]
): Promise<Record<string, string>[]> {
  const privatePath = await getPrivatePath(holster, plainPath);
  const [firstMap, ...restMap] = privatePath;
  let privateNode = holster.user().get(firstMap);
  for (const part of restMap) {
    privateNode = privateNode.next(part);
  }

  // First, collect all keys from the collection
  const keys: string[] = await new Promise<string[]>(resolve => {
    privateNode.next(null, data => {
      if (!isRecord(data)) {
        resolve([]);
        return;
      }

      resolve(
        Object.keys(data).filter(k => k !== '_' && data[k] != null)
      );
    });
  });

  // Then for each key, access the fields at privatePath + [key] + [hashedFieldName]
  const results: Record<string, string>[] = [];
  for (const key of keys) {
    try {
      const record: Record<string, string> = {};
      for (const fieldName of fields) {
        // privatePath is already hashed, key from collection is hashed,
        // only fieldName needs hashing
        const fieldNameHash = await getPrivatePathPart(holster, fieldName);
        const fullHashedPath = [...privatePath, key, fieldNameHash];
        const fieldValue = await readPrivateData(holster, [], fullHashedPath);
        record[fieldName] = fieldValue;
      }
      if (Object.keys(record).length > 0) {
        results.push(record);
      }
    } catch (error) {
      console.error(`Failed to read contact for key ${key}:`, (error as Error).message);
    }
  }

  return results;
}
```

Service note: the private read/write/delete paths here use `buildUserChain`/
`putUserPath` (deadline-bounded) — see section 2. `getUserSEA` and
`isSEACipher` are the helpers in `src/misc/seaHelpers.ts`; `isRecord` is
defined in section 5.

## 7. Contact System

To maintain privacy while allowing for advanced sharing features, we use the user profile discovery system to list out potential contacts. Then, the active user can view the pub/epub of the contact and choose whether or not to add that user as a contact. Adding a contact is done with:

```typescript
await writePrivateData(holster, ['contacts', aliceUsername, 'username'], aliceUsername)
await writePrivateData(holster, ['contacts', aliceUsername, 'pub'], discovered[0].pub)
await writePrivateData(holster, ['contacts', aliceUsername, 'epub'], discovered[0].data.epub)
```

Note: `discovered[0].data` is the resolved `~pub` user node
(`{username, pub, epub}`) — the alias entry itself is only a rel and
carries no keys.

Contacts are then loaded with:

```typescript
const bobContactUsername = await readPrivateData(holster, ['contacts', aliceUsername, 'username'])
// or for multiple contacts:
const allContacts = await readPrivateMap(holster, ['contacts'], ['username', 'pub', 'epub'])
```

## 8. Error Handling

Holster callbacks are Node-style: the argument is a plain STRING error
message or `null`/`undefined` on success. There is NO GunDB-style
`{err}` object ack — an `ack.err` check silently turns every failure into
success. Check truthiness instead:

```typescript
holster.get('node').put('data', (err) => {
  if (err) {
    console.error('Operation failed:', err);
    // Handle specific errors
    if (err.includes('already exists')) {
      // Handle duplicate user
    }
  }
});
```

Raw wire-layer messages (`wire.get`/`wire.put`) are the exception: those
are objects with `put`/`err` fields. See docs/memory.md.

## 9. Service Context Notes

In production services (holsterService, encryptionService), SEA is available
via `holster.SEA`. It is NOT GunDB's string-based SEA: keys must be
objects with `epriv`, `SEA.encrypt` returns a `{ct, iv, s}` cipher
object, and failures return `null`, never `undefined`. See docs/memory.md
("Holster SEA Object Shapes").

These encryption and authentication patterns have been validated through comprehensive testing and are ready for production use.
