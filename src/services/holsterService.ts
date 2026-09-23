/**
 * Holster Service
 *
 * Service layer for Holster operations including initialization,
 * user management, and some read/write methods.
 */

import Holster from '@mblaney/holster/src/holster.js';
import { retryWithBackoff } from '@/lib/retry';
import { getUserSEA, isSEACipher } from '@/misc/seaHelpers';
import {
  Result,
  tryCatch,
  sequence,
  partitionResults,
  failure,
  success,
} from '@k98kurz/functional-result';
import type {
  HolsterInstance,
  HolsterConfig,
  HolsterError,
  HolsterUserNode,
  RelayStatus,
} from '@/types/holster';
import { HolsterErrorCode, HolsterNodeRef } from '@/types/holster';
import { relayMonitor } from '@/services/relayMonitor';

export interface SEAUser {
  alias: string;
  pub: string; // Public key
}

export interface ListItemResult {
  soul: string;
  data: string | Record<string, unknown>;
}

/**
 * Resolved user node read from a `~pub` soul during discovery. These are
 * the fields `user().create()` stores at the top level of the user node
 * (see node_modules/@mblaney/holster/src/user.js).
 */
export interface DiscoveredUserData {
  username?: string;
  pub?: string;
  epub?: string;
}

export interface DiscoveredUser {
  pub: string;
  data: DiscoveredUserData;
}

/**
 * IndexedDB database/object-store name Holster uses for local graph storage
 * (its `opt.file`). Dev builds use a separate database so tests never touch
 * "real" storage and it can be wiped via clearHolsterStorage(). Override
 * with VITE_APP_STORAGE_DB.
 */
export const STORAGE_DB_NAME =
  import.meta.env.VITE_APP_STORAGE_DB ||
  (import.meta.env.VITE_APP_DEV_MODE === 'true' ? 'radata_dev' : 'radata');

function createHolsterError(
  code: HolsterErrorCode,
  message: string,
  details?: unknown
): HolsterError {
  return {
    code,
    message,
    details,
  };
}

/**
 * Upper bound for waits on Holster callbacks (user().create()/auth() and
 * chain .put() acks). Above the library's 30s radisk read watchdog plus its
 * 10s wire null-ack timeout, so genuine slow paths still complete — only a
 * genuinely wedged storage layer (reads hang, write acks never arrive) trips
 * this. Holster has no write-ack watchdog of its own, so without this a
 * wedged IndexedDB turns every write into a promise that never settles.
 */
const OPERATION_DEADLINE_MS = 45_000;

const WEDGE_GUIDANCE =
  'The Holster storage layer or relay connection appears unresponsive. ' +
  'Reload the page, and if the problem persists close other tabs of ' +
  `this app and clear IndexedDB database '${STORAGE_DB_NAME}' (DevTools > ` +
  'Application > IndexedDB).';

/**
 * Run an operation that reports completion via (resolve, reject) callbacks,
 * failing with a diagnostic error if neither fires within `deadlineMs`.
 * The timer enforces a deadline only — it never delays the happy path,
 * which still resolves at callback speed.
 *
 * The timeout rejects with a HolsterError (STORAGE_ERROR). The deadline can
 * fire for a wedged local storage layer OR an unresponsive relay
 * (create/auth begin with reads that wait on the relay), so `getDetails` —
 * evaluated at timeout time, not call time — carries live relay state so
 * the caller can tell the two apart.
 */
function withDeadline<T>(
  operation: (
    resolve: (value: T) => void,
    reject: (error: unknown) => void
  ) => void,
  description: string,
  deadlineMs: number = OPERATION_DEADLINE_MS,
  getDetails?: () => unknown
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        createHolsterError(
          HolsterErrorCode.STORAGE_ERROR,
          `${description} timed out after ${deadlineMs}ms. ${WEDGE_GUIDANCE}`,
          getDetails?.()
        )
      );
    }, deadlineMs);
    try {
      operation(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    } catch (error) {
      // Operation threw synchronously instead of using its callbacks:
      // surface the error now and release the timer.
      clearTimeout(timer);
      reject(error);
    }
  });
}

function transformHolsterError(error: unknown): HolsterError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    return error as HolsterError;
  }
  if (error instanceof Error) {
    return createHolsterError(
      HolsterErrorCode.MISC_ERROR,
      error.message,
      error
    );
  }
  return createHolsterError(
    HolsterErrorCode.MISC_ERROR,
    'An error occurred',
    error
  );
}

/**
 * Type guard for values readable from a Holster node entry. Holster values
 * are strings, numbers, booleans, rels, or nested node objects.
 */
function isListEntryData(
  value: unknown
): value is string | Record<string, unknown> {
  if (typeof value === 'string') {
    return true;
  }
  return typeof value === 'object' && value !== null;
}

/**
 * Holster Service Class
 *
 * All Holster paths are namespaced with the app name to avoid collisions
 * when multiple applications share the same Holster relay server.
 * Default namespace: 'markdownmywords'
 */
class HolsterService {
  holster: HolsterInstance | null = null;
  isInitialized = false;
  appNamespace: string = 'markdownmywords';
  storageDbName: string = STORAGE_DB_NAME;

  /**
   * Convert HTTP/HTTPS URLs to WebSocket protocol for Holster
   * Holster requires ws:// or wss:// protocol for peer connections
   * @param url - URL to convert
   * @returns URL with WebSocket protocol
   */
  private convertToWebSocketUrl(url: string): string {
    return url.replace(/^https?:\/\//, match =>
      match === 'https://' ? 'wss://' : 'ws://'
    );
  }

  /**
   * Get default relay URL based on environment
   * @returns Production relay URL from env var, or localhost for dev
   */
  private getDefaultRelay(): string {
    return (
      import.meta.env.VITE_HOLSTER_RELAY_URL ||
      'https://relay.markdownmywords.com/gun'
    );
  }

  /**
   * Read configured relay URLs from localStorage, falling back to the default
   * relay when settings are absent, unparseable, or not a string array.
   */
  private readRelaySettings(): string[] {
    const relaySettings = localStorage.getItem('relaySettings');
    if (!relaySettings) {
      return [this.getDefaultRelay()];
    }

    try {
      const parsed: unknown = JSON.parse(relaySettings);
      if (Array.isArray(parsed)) {
        const urls = parsed.filter(
          (url): url is string => typeof url === 'string'
        );
        if (urls.length > 0) {
          return urls;
        }
      }
      console.warn(
        'Invalid relaySettings in localStorage; using default relay'
      );
    } catch {
      console.warn('Failed to parse relaySettings; using default relay');
    }

    return [this.getDefaultRelay()];
  }

  /**
   * Initialize Holster client
   * @param config - Additional Holster configuration
   */
  initialize(config?: HolsterConfig): void {
    if (this.isInitialized) {
      console.warn('Holster already initialized');
      return;
    }

    try {
      // Set app namespace for collision avoidance
      this.appNamespace = config?.appNamespace ?? 'markdownmywords';

      // Record the actual IndexedDB database Holster opens, so dev tools
      // (clearHolsterStorage) can target it even when config.file overrides
      // the STORAGE_DB_NAME default.
      this.storageDbName = config?.file ?? STORAGE_DB_NAME;

      // Read relay settings from localStorage. Corrupt or malformed settings
      // must not break initialization — fall back to the default relay.
      const rawRelayUrls = this.readRelaySettings();

      // Convert all relay URLs to WebSocket protocol
      const relayUrls = rawRelayUrls.map(url =>
        this.convertToWebSocketUrl(url)
      );

      console.log('[DEBUG] Initializing Holster with relays:', relayUrls);

      const holsterConfig: {
        peers: string[];
        indexedDB?: boolean;
        file?: string;
      } = {
        peers: relayUrls,
        // Selects the storage backend: true uses IndexedDB, false uses
        // Holster's Node filesystem store. Node has no IndexedDB, so the
        // vitest run passes false.
        indexedDB: config?.indexedDB ?? true,
        file: this.storageDbName,
      };

      // Track the REAL peer sockets Holster creates. Must be installed before
      // Holster() constructs them: Holster exposes no connection events, so this
      // wrapper is the only way to report actual relay connectivity.
      relayMonitor.install(relayUrls);

      this.holster = Holster(holsterConfig) as HolsterInstance;

      this.isInitialized = true;
      console.log('Holster initialized successfully', {
        relayUrls,
        appNamespace: this.appNamespace,
        storageDb: holsterConfig.file,
      });

      this.probeLocalStorage();
    } catch (error) {
      const holsterError: HolsterError = {
        code: HolsterErrorCode.INIT_FAILED,
        message: 'Failed to initialize Holster',
        details: error,
      };
      throw holsterError;
    }
  }

  /**
   * Snapshot of relay connection states, attached to deadline timeout
   * errors as details: a wedged local storage layer (relays connected)
   * can then be told apart from an unresponsive relay (the actual culprit
   * for read-gated paths like create/auth).
   */
  private relayStatusSummary(): Record<string, string> {
    return Object.fromEntries(relayMonitor.getRelayStatuses());
  }

  /**
   * Fire-and-forget storage health check: exercise one full-node wire read
   * (which traverses radisk + IndexedDB, the layer that wedges silently)
   * and warn loudly if it does not respond within 10s. Never blocks or
   * fails initialization — reads are bounded by the library's own watchdog,
   * but the warning surfaces a wedged storage layer up front instead of as
   * an unexplained 30s-per-read crawl later.
   */
  private probeLocalStorage(): void {
    if (!this.holster) return;
    const holster = this.holster;
    withDeadline<void>(
      (resolve, _reject) => {
        holster.wire.get({ '#': 'root' }, () => resolve());
      },
      'Storage health check',
      10_000
    ).catch(() => {
      console.warn(`[holsterService] ${WEDGE_GUIDANCE}`);
    });
  }

  /**
   * Get Holster instance
   * @throws {HolsterError} If Holster is not initialized
   */
  getHolster(): HolsterInstance {
    if (!this.holster || !this.isInitialized) {
      throw {
        code: HolsterErrorCode.INIT_FAILED,
        message: 'Holster not initialized. Call initialize() first.',
      } as HolsterError;
    }
    return this.holster;
  }

  /**
   * Get connection state
   */
  getConnectionState(): 'connected' | 'disconnected' | 'connecting' {
    return relayMonitor.getConnectionState();
  }

  /**
   * Get relay status map
   * @returns Fresh snapshot of relay URLs to connection status
   */
  getRelayStatuses(): Map<string, RelayStatus> {
    return relayMonitor.getRelayStatuses();
  }

  /**
   * Get connection time for a specific peer
   * @param url - Relay URL
   * @returns Connection timestamp or undefined
   */
  getPeerConnectionTime(url: string): number | undefined {
    return relayMonitor.getPeerConnectionTime(url);
  }

  /**
   * Save relay settings to localStorage
   * @param relayUrls - Array of relay URLs to save
   */
  saveRelaySettings(relayUrls: string[]): void {
    const urlsToSave =
      relayUrls.length === 0 ? [this.getDefaultRelay()] : relayUrls;
    localStorage.setItem('relaySettings', JSON.stringify(urlsToSave));
    console.log('[DEBUG] Saved relay settings to localStorage:', urlsToSave);
  }

  /**
   * Get stored relay settings from localStorage
   * @returns Array of relay URLs from localStorage or default
   */
  getStoredRelays(): string[] {
    return this.readRelaySettings();
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.holster !== null;
  }

  /**
   * Generate a new UUID.
   * @returns string
   */
  newId(): string {
    return crypto.randomUUID();
  }

  /**
   * Write user profile for discovery by other users
   * Stores the user's epub and username at their user node's profile sub-path
   * Reference: code_references/holster.md
   */
  async writeProfile(): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      const holster = this.getHolster();
      const userNode = holster.user();
      const userState = userNode.is;

      if (!userState || !('epub' in userState) || !userState.epub) {
        throw createHolsterError(
          HolsterErrorCode.MISC_ERROR,
          'User session not available or ECDH key missing'
        );
      }

      const profileData: { epub: string; username?: string } = {
        epub: userState.epub,
      };

      if (userState.username && typeof userState.username === 'string') {
        profileData.username = userState.username;
      }

      // writeUserPath returns a Result (it never throws), so a failed write
      // must be surfaced explicitly or registration would falsely succeed.
      const result = await this.writeUserPath(
        ['profile'],
        profileData,
        'Profile storage'
      );
      if (!result.success) {
        throw result.error;
      }
    }, transformHolsterError);
  }

  /**
   * Read a standalone soul (like `~pub` or `~@username`) via the wire spec.
   *
   * Root-level `.get(key, cb)` only resolves properties of the `root` soul,
   * so standalone souls are unreachable through it: the property lookup
   * misses ("never written" branch in holster.js resolve()) and calls back
   * null. Direct wire reads are the pattern Holster's own `user().auth()`
   * uses. Note: wire reads do NOT inline rels — rel properties arrive as
   * `{'#': soul}` references and must be followed manually.
   * @param soul - Soul to read (e.g. `~abc123...` or `~@username`)
   * @returns Promise resolving to the node object, or null if absent
   */
  private readSoul(soul: string): Promise<Record<string, unknown> | null> {
    return new Promise(resolve => {
      this.getHolster().wire.get({ '#': soul }, msg => {
        const node = msg.put?.[soul];
        resolve(
          node && typeof node === 'object'
            ? (node as Record<string, unknown>)
            : null
        );
      });
    });
  }

  /**
   * Read username from user profile for session restoration
   * @returns Promise resolving to username string
   */
  async readUsername(): Promise<Result<string, HolsterError>> {
    return tryCatch<string, HolsterError>(async () => {
      const userNode = this.getHolster().user();
      const userState = userNode.is;

      if (!userState || !userState.pub) {
        throw createHolsterError(
          HolsterErrorCode.MISC_ERROR,
          'User session not available'
        );
      }

      // Chain read rooted at the `~pub` soul: follows the profile rel and
      // returns the profile node ({epub, username}).
      const profile = await new Promise<unknown>(resolve => {
        userNode.get('profile', (data: unknown) => {
          resolve(data);
        });
      });

      if (
        profile &&
        typeof profile === 'object' &&
        'username' in profile &&
        typeof profile.username === 'string'
      ) {
        return profile.username;
      }
      throw createHolsterError(
        HolsterErrorCode.MISC_ERROR,
        'Username not found in user profile'
      );
    }, transformHolsterError);
  }

  /**
   * Create user with SEA
   * Reference: code_references/holster.md
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to void
   */
  async createUser(
    username: string,
    password: string
  ): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      if (!this.holster) {
        throw createHolsterError(
          HolsterErrorCode.INIT_FAILED,
          'Holster not initialized'
        );
      }

      await withDeadline<void>(
        (resolve, reject) => {
          const holster = this.holster!;
          holster.user().create(username, password, err => {
            // Holster callbacks are Node-style: err is a string or null.
            if (err) {
              reject(new Error(`User creation failed: ${err}`));
            } else {
              resolve();
            }
          });
        },
        'User creation',
        OPERATION_DEADLINE_MS,
        () => this.relayStatusSummary()
      );
    }, transformHolsterError);
  }

  /**
   * Authenticate user
   * Reference: code_references/holster.md
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to void
   */
  async authenticateUser(
    username: string,
    password: string
  ): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      if (!this.holster) {
        throw createHolsterError(
          HolsterErrorCode.INIT_FAILED,
          'Holster not initialized'
        );
      }

      await withDeadline<void>(
        (resolve, reject) => {
          const holster = this.holster!;
          holster.user().auth(username, password, err => {
            // Holster callbacks are Node-style: err is a string or null.
            if (err) {
              reject(new Error(`Authentication failed: ${err}`));
            } else {
              // auth() only sets user.is in memory; persist it to
              // sessionStorage so a page refresh can recall() the session.
              // store() without an argument uses sessionStorage. Guard it so a
              // storage failure (e.g. setItem throwing) cannot leave the auth
              // promise unresolved until the deadline fires.
              try {
                holster.user().store();
              } catch (storeErr) {
                console.warn('Failed to persist Holster session:', storeErr);
              }
              resolve();
            }
          });
        },
        'Authentication',
        OPERATION_DEADLINE_MS,
        () => this.relayStatusSummary()
      );
    }, transformHolsterError);
  }

  /**
   * Discover users who claim a specific username
   *
   * Reads the `~@username` alias index (a standalone soul — must be read
   * via the wire spec, see readSoul), then resolves each `~pub` user node
   * it references. The user node carries {username, pub, epub} at its top
   * level (written by `user().create()`).
   * Reference: code_references/holster.md
   * @param username - Username to search for
   * @returns Promise resolving to array of discovered user profiles
   */
  async discoverUsers(
    username: string
  ): Promise<Result<DiscoveredUser[], HolsterError>> {
    return tryCatch<DiscoveredUser[], HolsterError>(async () => {
      const aliasNode = await this.readSoul(`~@${username}`);
      if (!aliasNode) {
        return [];
      }

      // The graph layer (ham.js) enforces that alias entries are
      // self-identifying rels ({'#': '~pub'}), so every non-`_` key is a
      // `~pub` soul.
      const pubSouls = Object.keys(aliasNode).filter(key => {
        if (key === '_') {
          return false;
        }
        const value = aliasNode[key];
        return (
          value !== null &&
          typeof value === 'object' &&
          '#' in value &&
          typeof value['#'] === 'string'
        );
      });

      const profiles = await Promise.all(
        pubSouls.map(async pubSoul => {
          const userNode = await this.readSoul(pubSoul);
          if (!userNode) {
            return null;
          }

          const data: DiscoveredUserData = {};
          if (typeof userNode['username'] === 'string') {
            data.username = userNode['username'];
          }
          if (typeof userNode['pub'] === 'string') {
            data.pub = userNode['pub'];
          }
          if (typeof userNode['epub'] === 'string') {
            data.epub = userNode['epub'];
          }

          return {
            pub: pubSoul.startsWith('~') ? pubSoul.slice(1) : pubSoul,
            data,
          };
        })
      );

      return profiles.filter(
        (profile): profile is DiscoveredUser => profile !== null
      );
    }, transformHolsterError);
  }

  /**
   * List out all items at a specific node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listItems(
    nodePath: string[],
    startNode?: HolsterUserNode | HolsterInstance
  ): Promise<Result<ListItemResult[], HolsterError>> {
    return tryCatch<ListItemResult[], HolsterError>(async () => {
      const holster = this.getHolster();
      if (nodePath.length === 0) {
        return [];
      }
      const items = await new Promise<ListItemResult[]>(resolve => {
        const [first, ...rest] = nodePath;
        let node: HolsterNodeRef = (startNode ?? holster).get(first);
        for (const part of rest) {
          node = node.next(part);
        }

        node.next(null, (data: unknown) => {
          if (!data || typeof data !== 'object') {
            resolve([]);
            return;
          }

          // Chain reads inline rels, so each entry's data is already the
          // referenced value or node — no per-entry re-read needed.
          const items = Object.entries(data)
            .filter(([k, v]) => k !== '_' && v != null && isListEntryData(v))
            .map(([soul, entryData]) => ({
              soul: soul.startsWith('~') ? soul.slice(1) : soul,
              data: entryData,
            }));

          resolve(items);
        });
      });
      return items;
    }, transformHolsterError);
  }

  /**
   * List out all items at a specific user node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listUserItems(
    nodePath: string[]
  ): Promise<Result<ListItemResult[], HolsterError>> {
    return await this.listItems(nodePath, this.getHolster().user());
  }

  /**
   * Hash a path part for private data storage
   * Reference: code_references/holster.md
   * @param plainPath - Plain text path part to hash
   * @returns Promise resolving to hashed path string
   */
  async getPrivatePathPart(
    plainPath: string
  ): Promise<Result<string, HolsterError>> {
    return tryCatch<string, HolsterError>(async () => {
      const SEA = this.getHolster().SEA;
      if (!SEA) {
        throw createHolsterError(
          HolsterErrorCode.MISC_ERROR,
          'SEA not available'
        );
      }
      const holster = this.getHolster();
      const user = holster.user();

      const sea = getUserSEA(user);
      if (!sea) {
        throw createHolsterError(
          HolsterErrorCode.MISC_ERROR,
          'User cryptographic keypair not available'
        );
      }

      // The salt MUST be a scalar (the user's epriv): passing the whole
      // user.is/pair object makes SEA.work stringify it via TextEncoder to
      // the literal '[object Object]', so every user derives the SAME hash
      // for a given path — destroying node-name privacy (see docs/memory.md).
      const result = await SEA.work(plainPath, sea.epriv);
      if (!result || !result.epriv) {
        throw createHolsterError(
          HolsterErrorCode.MISC_ERROR,
          'Failed to hash path part'
        );
      }
      // SEA.work returns an {epriv} pair object — .epriv is the hashed
      // string. Returning the object itself would make Holster coerce the
      // path via String(key) to '[object Object]', colliding every private
      // path into one node (see docs/memory.md).
      return result.epriv;
    }, transformHolsterError);
  }

  /**
   * Hash all path parts for private data storage
   * Reference: code_references/holster.md
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to array of hashed path strings
   */
  async getPrivatePath(
    plainPath: string[]
  ): Promise<Result<string[], HolsterError>> {
    const pathResults: Result<string, HolsterError>[] = await Promise.all(
      plainPath.map(p => this.getPrivatePathPart(p))
    );
    return sequence(pathResults);
  }

  /**
   * Build a FRESH user-scoped chain for a path.
   *
   * Every read AND every write must use a fresh chain: a chain that has
   * delivered a read callback has had its context deleted by Holster, so a
   * later `.put()` on the same chain silently no-ops and its ack never fires
   * (see docs/memory.md, "Holster Chains Are Single-Use After a Read").
   * Centralizing this here makes reusing a chain structurally impossible.
   *
   * @param path - user-scoped path parts, e.g. ['docs', docId]
   * @param emptyPathMessage - error message when `path` is empty
   * @returns A fresh chain node rooted at the logged-in user's `~pub` soul
   */
  private buildUserChain(
    path: string[],
    emptyPathMessage = 'Path must contain at least one part'
  ): HolsterNodeRef {
    const [first, ...rest] = path;
    if (first === undefined) {
      throw createHolsterError(HolsterErrorCode.MISC_ERROR, emptyPathMessage);
    }

    let node: HolsterNodeRef = this.getHolster().user().get(first);
    for (const part of rest) {
      node = node.next(part);
    }
    return node;
  }

  /**
   * Put data at a user-scoped path, bounding the ack wait with withDeadline
   * so a wedged storage layer fails loudly (see docs/memory.md). Shared by
   * `writeUserPath` (plaintext) and the private-data write/delete paths
   * (which pass already-hashed paths and ciphertext or null).
   *
   * @param path - user-scoped path parts (hashed for private data)
   * @param data - value to put (any Holster-convertible data, or null)
   * @param description - label for put/deadline errors
   * @param emptyPathMessage - error message when `path` is empty
   */
  private async putUserPath(
    path: string[],
    data: unknown,
    description: string,
    emptyPathMessage?: string
  ): Promise<void> {
    const node = this.buildUserChain(path, emptyPathMessage);
    await withDeadline<void>(
      (resolve, reject) => {
        node.put(data, err => {
          if (err) {
            reject(new Error(`${description}: ${err}`));
          } else {
            resolve();
          }
        });
      },
      description,
      OPERATION_DEADLINE_MS,
      () => this.relayStatusSummary()
    );
  }

  /**
   * Write encrypted private data to user storage
   * Reference: code_references/holster.md
   * @param plainPath - Array of plain text path parts
   * @param plaintext - Data to encrypt and store
   * @returns Promise resolving to void
   */
  async writePrivateData(
    plainPath: string[],
    plaintext: string
  ): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      const holster = this.getHolster();
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }

      const sea = getUserSEA(holster.user());
      if (!sea) {
        throw new Error('User cryptographic keypair not available');
      }

      const SEA = holster.SEA;
      const ciphertext = await SEA?.encrypt(plaintext, sea);
      if (!ciphertext) {
        throw new Error('SEA.encrypt failed: returned null');
      }

      await this.putUserPath(
        privatePathResult.data,
        ciphertext,
        'Failed to write private data'
      );
    }, transformHolsterError);
  }

  /**
   * Write arbitrary (unencrypted) data to a user-scoped chain path.
   *
   * Always builds a FRESH chain: a chain that has delivered a read callback
   * has had its context deleted by Holster, so a later `.put()` on the same
   * chain silently no-ops and its ack never fires (see docs/memory.md). The
   * ack wait is bounded by withDeadline so a wedged storage layer fails
   * loudly instead of hanging forever.
   *
   * @param path - user-scoped path parts, e.g. ['docs', docId]
   * @param data - value to put (any Holster-convertible data, or null)
   * @param description - label for put/deadline errors, e.g. 'Failed to update document'
   * @returns Promise resolving to void
   */
  async writeUserPath(
    path: string[],
    data: unknown,
    description: string
  ): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      await this.putUserPath(
        path,
        data,
        description,
        'writeUserPath requires a non-empty path'
      );
    }, transformHolsterError);
  }

  /**
   * Read and decrypt private data from user storage
   * Reference: code_references/holster.md
   * @param plainPath - Array of plain text path parts
   * @param hashedPath - Optional pre-hashed path (for internal use)
   * @returns Promise resolving to decrypted string
   */
  async readPrivateData(
    plainPath: string[],
    hashedPath?: string[]
  ): Promise<Result<string, HolsterError>> {
    return tryCatch<string, HolsterError>(async () => {
      const holster = this.getHolster();
      const pathResult = await this.getPrivatePath(plainPath);
      if (!pathResult.success) {
        throw pathResult.error;
      }
      const path = hashedPath || pathResult.data;
      const node = this.buildUserChain(path);

      const plaintext = await new Promise<string>((resolve, reject) => {
        const sea = getUserSEA(holster.user());
        if (!sea) {
          reject(new Error('User cryptographic keypair not available'));
          return;
        }

        node.next(null, async (ciphertext: unknown) => {
          // SEA.encrypt stores a {ct, iv, s} cipher object (plus Holster's
          // `_` graph metadata on read-back), never a plain string.
          if (ciphertext === undefined || !isSEACipher(ciphertext)) {
            reject(
              new Error('Private data not found or could not be decrypted')
            );
            return;
          }
          const SEA = holster.SEA;
          const plaintext = await SEA?.decrypt<string>(ciphertext, sea);
          if (plaintext === null || plaintext === undefined) {
            reject(
              new Error('Private data not found or could not be decrypted')
            );
            return;
          }
          resolve(plaintext);
        });
      });
      return plaintext;
    }, transformHolsterError);
  }

  /**
   * Read private structured data (like contacts) by iterating keys
   * Reference: code_references/holster.md
   * @param plainPath - Array of plain text path parts
   * @param fields - Array of field names to read
   * @returns Promise resolving to array of private data records
   */
  async readPrivateMap(
    plainPath: string[],
    fields: string[]
  ): Promise<Result<Record<string, string>[], HolsterError>> {
    return tryCatch<Record<string, string>[], HolsterError>(async () => {
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      const privatePath = privatePathResult.data;
      const privateNode = this.buildUserChain(privatePath);

      const keys: string[] = await new Promise<string[]>(resolve => {
        privateNode.next(null, (data: unknown) => {
          if (!data || typeof data !== 'object') {
            resolve([]);
            return;
          }

          const nodeKeys = Object.keys(data || {}).filter(
            k => k !== '_' && (data as Record<string, unknown>)[k] != null
          );
          resolve(nodeKeys);
        });
      });

      const fieldHashResults = await sequence(
        await Promise.all(
          fields.map(fieldName => this.getPrivatePathPart(fieldName))
        )
      );
      if (!fieldHashResults.success) throw fieldHashResults.error;

      const recordResults = await Promise.all(
        keys.map(async key => {
          const valueResults = await sequence(
            await Promise.all(
              fieldHashResults.data.map(hash =>
                this.readPrivateData([], [...privatePath, key, hash])
              )
            )
          );
          if (!valueResults.success) return failure(valueResults.error);

          const record: Record<string, string> = {};
          fields.forEach((field, i) => {
            record[field] = valueResults.data[i];
          });

          return success(record);
        })
      );

      const { successes, failures } = partitionResults(recordResults);
      failures.forEach(error =>
        console.error('Failed to read contact:', error)
      );

      return successes.filter(record => Object.keys(record).length > 0);
    }, transformHolsterError);
  }

  /**
   * Delete encrypted private data from user storage
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to void
   */
  async deletePrivateData(
    plainPath: string[]
  ): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      await this.putUserPath(
        privatePathResult.data,
        null,
        'Failed to delete private data'
      );
    }, transformHolsterError);
  }

  async logoutAndWait(): Promise<Result<void, HolsterError>> {
    return tryCatch<void, HolsterError>(async () => {
      const holster = this.getHolster();
      holster.user().leave();
      await retryWithBackoff(
        async _ => {
          if (holster.user().is) {
            throw new Error('user is not logging out');
          }
        },
        {
          maxAttempts: 6,
          baseDelay: 100,
          backoffMultiplier: 1.5,
        }
      );
    }, transformHolsterError);
  }

  /**
   * Wait for user state to be set (for authentication)
   * @returns Promise resolving to user pub key
   */
  public async waitForUserState(): Promise<Result<string, HolsterError>> {
    return tryCatch<string, HolsterError>(async () => {
      const holster = this.getHolster();
      await retryWithBackoff(
        async _ => {
          const user = holster.user();
          if (!user.is || !user.is.pub) {
            throw new Error('user is not authenticated');
          }
        },
        {
          maxAttempts: 6,
          baseDelay: 100,
          backoffMultiplier: 1.5,
        }
      );
      const user = holster.user();
      return user.is!.pub as string;
    }, transformHolsterError);
  }
}

// Export singleton instance
export const holsterService = new HolsterService();

// Export class for testing
export { HolsterService };
