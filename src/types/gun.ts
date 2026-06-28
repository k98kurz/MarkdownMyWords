/**
 * GunDB Type Definitions
 *
 * Type definitions for GunDB nodes and operations used throughout the application.
 * These types are compatible with both GunDB and Holster.
 */

/**
 * SEA Instance type
 */
export interface SEAInstance {
  encrypt(
    data: unknown,
    pair: { epriv: string } | string
  ): Promise<string>;
  decrypt<T = any>(
    message: string,
    pair: { epriv: string } | string
  ): Promise<T>;
  secret(
    key: string | { epub: string },
    pair: { epriv: string; epub: string }
  ): Promise<string | undefined>;
  pair(): Promise<{ epriv: string; epub: string; priv: string; pub: string }>;
  work(
    data: unknown,
    salt?: unknown,
    callback?: unknown
  ): Promise<string | undefined>;
  sign(
    data: unknown,
    pair: { priv: string; pub: string }
  ): Promise<string>;
  verify<T = any>(
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
 * GunDB instance type
 * Compatible with both GunDB and Holster APIs
 */
export interface GunInstance {
  get: (key: string) => GunNodeRef;
  user: () => GunUserNode;
  on: (event: string, callback: (peer: { url: string }) => void) => void;
  opt: (config: { peers: string[] }) => void;
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
 * GunDB Node Reference
 */
export interface GunNodeRef {
  get: (key: string) => GunNodeRef;
  put: (data: unknown, callback?: (ack: GunAck) => void) => GunNodeRef | void;
  once: (callback: (data: unknown, key: string) => void) => GunNodeRef;
  on: (callback: (data: unknown, key: string) => void) => GunNodeRef | void;
  map: () => GunNodeRef;
  off: (callback?: (data: unknown) => void) => GunNodeRef | void;
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
 * GunDB Configuration
 */
export interface GunConfig {
  relayUrl?: string;
  peers?: string[];
  localStorage?: boolean;
  radisk?: boolean;
  /**
   * Application namespace for collision avoidance.
   * All GunDB paths will be prefixed with this namespace.
   * Default: 'markdownmywords'
   * Example: With namespace 'markdownmywords', user paths become 'markdownmywords~user~{userId}'
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
 * GunDB acknowledgment from put/set operations
 */
export interface GunAck {
  err?: string | null;
  ok?: number | Record<string, number> | null;
  v?: number | null;
}

/**
 * GunDB user session state (gun.user().is)
 */
export interface GunUserSession {
  alias?: string;
  pub?: string;
  epub?: string;
  sea?: unknown;
}

/**
 * GunDB user node with session state
 */
export interface GunUserNode {
  is?: GunUserSession;
  _: {
    sea: ISEAPair;
  };
  get: (path: string) => GunNodeRef;
  put: (data: unknown, callback?: (ack: GunAck) => void) => void;
  once: (callback: (data: unknown, key: string) => void) => void;
  auth: (
    alias: string,
    password: string,
    callback?: (ack: GunAck) => void
  ) => void;
  create: (
    alias: string,
    password: string,
    callback?: (ack: GunAck) => void
  ) => void;
  leave: () => void;
  recall: (options?: { sessionStorage?: boolean }, callback?: (ack: unknown) => void) => void;
}
