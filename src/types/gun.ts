/**
 * Holster Type Definitions
 *
 * Type definitions for Holster nodes and operations used throughout the
 * application. These mirror the actual Holster runtime API (see
 * node_modules/@mblaney/holster/src/holster.js).
 *
 * CRITICAL: Holster's chain API is exactly `next`, `put`, `on`, `off`.
 * There is no `.get(cb)` on chains and no `.once()` anywhere:
 * - Start a chain from the root instance or user node with `.get(key)`
 * - Extend a chain with `.next(key)`
 * - Read the current chain node with `.next(null, cb)`
 * - Read a child with `.next(key, cb)`
 * - Root/user-level single reads use `.get(key, cb)`
 */

/**
 * SEA cipher object returned by SEA.encrypt and required by SEA.decrypt.
 * All fields are base64 strings.
 */
export interface SEACipher {
  ct: string;
  iv: string;
  s: string;
}

/**
 * SEA key object accepted by SEA.encrypt/decrypt — a bare string key is NOT
 * accepted (the `!pair.epriv` guard returns null). `SEA.work` and
 * `SEA.secret` return this shape so their results can be passed straight
 * back to encrypt/decrypt.
 */
export interface SEAPair {
  epriv: string;
}

/**
 * SEA Instance type
 *
 * Mirrors the real Holster runtime API
 * (node_modules/@mblaney/holster/src/sea.js):
 * - encrypt/decrypt/secret return `null` on failure (not undefined)
 * - encrypt returns a SEACipher object, decrypt takes a SEACipher
 * - secret only accepts `{ epub }`, never a bare string
 * - work returns a SEAPair whose `.epriv` is the derived hash string
 */
export interface SEAInstance {
  encrypt(data: unknown, pair: SEAPair): Promise<SEACipher | null>;
  decrypt<T = unknown>(message: SEACipher, pair: SEAPair): Promise<T | null>;
  secret(
    key: { epub: string },
    pair: { epriv: string; epub: string }
  ): Promise<SEAPair | null>;
  pair(): Promise<{ epriv: string; epub: string; priv: string; pub: string }>;
  work(data: unknown, salt?: unknown): Promise<SEAPair>;
  sign(
    data: unknown,
    pair: { priv: string; pub: string }
  ): Promise<string>;
  verify<T = unknown>(
    message: string,
    pair: string | { pub: string }
  ): Promise<T>;
}

/**
 * GunDB/Holster Constructor type
 */
export interface GunConstructor {
  (options?: Record<string, unknown>): GunInstance;
  SEA: SEAInstance;
}

/**
 * Wire-spec lex identifier: a soul with an optional property filter.
 * This is the only way to read a STANDALONE soul (like `~pub` or
 * `~@username`) — root-level `.get(key, cb)` reads properties of the
 * `root` soul and always returns null for standalone souls.
 */
export interface WireLex {
  '#': string;
  '.'?: string | string[] | null;
}

/**
 * Raw wire-spec message delivered to `wire.get` callbacks. Unlike chain
 * reads, wire reads do NOT inline rels — rel properties arrive as
 * `{'#': soul}` references and must be followed manually.
 */
export interface WireMessage {
  err?: string;
  put?: Record<string, unknown>;
}

/**
 * Wire spec access (mirrors holster.js `api.wire`), used by Holster's own
 * `user().auth()` for direct soul reads.
 */
export interface GunWire {
  get: (lex: WireLex, callback: (msg: WireMessage) => void) => void;
}

/**
 * SEA Key Pair (matching GunDB ISEAPair and Holster UserPair)
 */
export interface ISEAPair {
  /** private key for encryption */
  epriv: string;
  /** public key for encryption */
  epub: string;
  /** private key */
  priv: string;
  /** public key */
  pub: string;
}

/**
 * Holster instance type (root API)
 */
export interface GunInstance {
  get: ((key: string) => GunNodeRef) &
    ((key: string, callback: (data: unknown) => void) => void);
  user: () => GunUserNode;
  opt: (config: { peers: string[] }) => void;
  SEA: SEAInstance;
  wire: GunWire;
}

/**
 * User Profile
 */
export interface UserProfile {
  username: string;
  encryptedProfile?: string;
  publicKey?: string;
}

/**
 * User Settings
 */
export interface UserSettings {
  theme: 'light' | 'dark';
  editorSettings?: {
    fontSize?: number;
    wordWrap?: boolean;
    [key: string]: unknown;
  };
  openRouterApiKey?: string; // Encrypted
}

/**
 * User Node
 * Path: {appNamespace}~user~{userId}
 * Example: markdownmywords~user~{userId}
 */
export interface User {
  profile: UserProfile;
  documents?: {
    [docId: string]: {
      docId: string;
      accessLevel: 'owner' | 'write' | 'read';
      addedAt: number;
    };
  };
  settings?: UserSettings;
}

/**
 * Holster Node Reference (chain API)
 *
 * Chains are started with `.get(key)` on a GunInstance or GunUserNode and
 * extended with `.next(key)`. Reads happen via the `next` callback overloads.
 */
export interface GunNodeRef {
  next: ((key: string) => GunNodeRef) &
    ((key: string, callback: (data: unknown) => void) => void) &
    ((key: null, callback: (data: unknown) => void) => void);
  put: (data: unknown, callback?: AckCallback) => void;
  on: (lex: unknown, callback: (data: unknown) => void) => void;
  off: (callback?: (data: unknown) => void) => void;
}

/**
 * GunDB Error Types
 */
export enum GunErrorCode {
  INIT_FAILED = 'INIT_FAILED',
  MISC_ERROR = 'MISC_ERROR',
  OFFLINE = 'OFFLINE',
  STORAGE_ERROR = 'STORAGE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_DATA = 'INVALID_DATA',
}

/**
 * GunDB Error
 */
export interface GunError {
  code: GunErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Holster Configuration
 */
export interface GunConfig {
  peers?: string[];
  indexedDB?: boolean;
  /**
   * Application namespace for collision avoidance.
   * All Holster paths will be prefixed with this namespace.
   * Default: 'markdownmywords'
   */
  appNamespace?: string;
}

/**
 * Subscription Callback Types
 */
export type UserCallback = (user: User | null) => void;

/**
 * Unsubscribe function returned by subscription methods
 */
export type Unsubscribe = () => void;

/**
 * Holster callback convention (user().create/auth and chain .put()):
 * Node-style (err) callbacks where err is a plain STRING error message,
 * or null/undefined on success — NEVER GunDB's `{err}` object ack
 * (see node_modules/@mblaney/holster/src/user.js and holster.js).
 * TRUTHINESS IS THE ERROR CHECK: `if (ack)` means it failed.
 */
export type AckCallback = (err: string | null | undefined) => void;

/**
 * Holster user session state (holster.user().is)
 *
 * Holster stores the SEA key pair directly on the session (NOT under
 * user._.sea like GunDB): auth() sets
 * {username, pub, epub, priv, epriv}.
 */
export interface GunUserSession {
  username?: string;
  pub?: string;
  epub?: string;
  priv?: string;
  epriv?: string;
}

/**
 * Holster user node with session state
 *
 * `user()` merges the user API with the chain API. Its `get` override
 * behaves like the root `get` (chain start, or read with callback).
 */
export interface GunUserNode {
  is?: GunUserSession;
  /**
   * `[pub, key]` roots the chain at the standalone `~pub` soul (works
   * without being logged in as that user); a bare string key roots at the
   * logged-in user's own `~pub` soul.
   */
  get: ((keys: [pub: string, key: string]) => GunNodeRef) &
    ((
      keys: [pub: string, key: string],
      callback: (data: unknown) => void
    ) => void) &
    ((key: string) => GunNodeRef) &
    ((key: string, callback: (data: unknown) => void) => void);
  put: (data: unknown, callback?: AckCallback) => void;
  auth: (alias: string, password: string, callback?: AckCallback) => void;
  create: (alias: string, password: string, callback?: AckCallback) => void;
  leave: () => void;
  recall: () => void;
}
