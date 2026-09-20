/**
 * Holster Service
 *
 * Service layer for Holster operations including initialization,
 * user management, and some read/write methods.
 */

import Gun from '@mblaney/holster/src/holster.js';
import { retryWithBackoff } from '@/lib/retry';
import { getUserSEA, isSEACipher } from '@/misc/seaHelpers';
import {
  Result,
  tryCatch,
  sequence,
  partitionResults,
  failure,
  success,
} from '@/lib/functionalResult';
import type {
  GunInstance,
  GunConfig,
  GunError,
  GunUserNode,
  GunAck,
} from '@/types/gun';
import { GunErrorCode, GunNodeRef } from '@/types/gun';

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

function createGunError(
  code: GunErrorCode,
  message: string,
  details?: unknown
): GunError {
  return {
    code,
    message,
    details,
  };
}

function transformGunError(error: unknown): GunError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    return error as GunError;
  }
  if (error instanceof Error) {
    return createGunError(GunErrorCode.MISC_ERROR, error.message, error);
  }
  return createGunError(GunErrorCode.MISC_ERROR, 'An error occurred', error);
}

/**
 * Type guard for values readable from a Holster node entry. Holster values
 * are strings, numbers, booleans, rels, or nested node objects.
 */
function isListEntryData(value: unknown): value is string | Record<string, unknown> {
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
class GunService {
  holster: GunInstance | null = null;
  isInitialized = false;
  appNamespace: string = 'markdownmywords';
  relays: Map<string, 'init' | 'connecting' | 'connected' | 'disconnected'> =
    new Map();
  peerConnectionTimes: Map<string, number> = new Map();
  private connectionProbeInterval: number | null = null;

  /**
   * Convert HTTP/HTTPS URLs to WebSocket protocol for Holster
   * Holster requires ws:// or wss:// protocol for peer connections
   * @param url - URL to convert
   * @returns URL with WebSocket protocol
   */
  private convertToWebSocketUrl(url: string): string {
    return url.replace(/^https?:\/\//, (match) =>
      match === 'https://' ? 'wss://' : 'ws://'
    );
  }

  /**
   * Get default relay URL based on environment
   * @returns Production relay URL from env var, or localhost for dev
   */
  private getDefaultRelay(): string {
    return (
      import.meta.env.VITE_GUN_RELAY_URL ||
      'https://relay.markdownmywords.com/gun'
    );
  }

  /**
   * Initialize Holster client
   * @param config - Additional Holster configuration
   */
  initialize(config?: GunConfig): void {
    if (this.isInitialized) {
      console.warn('Holster already initialized');
      return;
    }

    try {
      // Set app namespace for collision avoidance
      this.appNamespace = config?.appNamespace ?? 'markdownmywords';

      // Read relay settings from localStorage
      const relaySettings = localStorage.getItem('relaySettings');
      const rawRelayUrls: string[] = relaySettings
        ? JSON.parse(relaySettings)
        : [this.getDefaultRelay()];

      // Convert all relay URLs to WebSocket protocol
      const relayUrls = rawRelayUrls.map(url =>
        this.convertToWebSocketUrl(url)
      );

      // Initialize all relays as connecting
      relayUrls.forEach(url => {
        this.relays.set(url, 'init');
      });

      console.log('[DEBUG] Initializing Holster with relays:', relayUrls);

      const holsterConfig: {
        peers: string[];
        indexedDB?: boolean;
      } = {
        peers: relayUrls,
        indexedDB: true,
      };

      this.holster = Gun(holsterConfig) as GunInstance;

      // Set up connection state monitoring
      console.log(
        '[DEBUG] Initializing Holster - calling setupConnectionMonitoring()'
      );
      this.setupConnectionMonitoring();

      this.isInitialized = true;
      console.log('Holster initialized successfully', {
        relayUrls,
        appNamespace: this.appNamespace,
      });
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.INIT_FAILED,
        message: 'Failed to initialize Holster',
        details: error,
      };
      throw gunError;
    }
  }

  /**
   * Probe a single relay with a throwaway WebSocket connection.
   * Holster does not expose peer connection events, so relay connectivity is
   * determined by whether the relay's WebSocket endpoint is reachable.
   */
  private probeRelay(url: string): void {
    if (!this.relays.has(url)) return;
    if (this.relays.get(url) === 'init') {
      this.relays.set(url, 'connecting');
    }

    let opened = false;
    const socket = new WebSocket(url);

    const finish = (status: 'connected' | 'disconnected') => {
      window.clearTimeout(timeout);
      if (socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
      if (!this.relays.has(url)) return;
      if (status === 'connected') {
        this.relays.set(url, 'connected');
        this.peerConnectionTimes.set(url, Date.now());
      } else {
        this.relays.set(url, 'disconnected');
        this.peerConnectionTimes.delete(url);
      }
    };

    const timeout = window.setTimeout(() => {
      if (!opened) finish('disconnected');
    }, 5000);

    socket.onopen = () => {
      opened = true;
      finish('connected');
      console.log(`Holster relay reachable: ${url}`);
    };
    socket.onclose = () => {
      if (!opened) finish('disconnected');
    };
    socket.onerror = () => {
      if (!opened) finish('disconnected');
    };
  }

  /**
   * Probe all configured relays
   */
  private probeAllRelays(): void {
    this.relays.forEach((_, url) => this.probeRelay(url));
  }

  /**
   * Set up connection state monitoring
   *
   * Holster does not expose peer connection events (GunDB's 'hi'/'bye' do not
   * exist in Holster), so relay connectivity is tracked with periodic
   * WebSocket probes. Returns true when new relays were registered, allowing
   * callers to skip redundant peer updates otherwise.
   */
  setupConnectionMonitoring(): boolean {
    if (!this.holster) {
      console.log(
        '[DEBUG] setupConnectionMonitoring() - no holster instance, returning'
      );
      return false;
    }

    if (this.relays.size === 0) {
      console.log(
        '[DEBUG] No relay configured - running in local-only mode, returning early'
      );
      return false;
    }

    const hasNewRelays = [...this.relays.values()].some(v => v === 'init');
    if (!hasNewRelays && this.connectionProbeInterval !== null) {
      console.log('[DEBUG] No new relays to monitor; monitoring already active');
      return false;
    }

    if (this.connectionProbeInterval === null) {
      console.log(
        `Monitoring ${this.relays.size} relay(s) via WebSocket probes:`,
        Array.from(this.relays.keys())
      );
      this.probeAllRelays();
      this.connectionProbeInterval = window.setInterval(() => {
        this.probeAllRelays();
      }, 10000);
    } else {
      this.relays.forEach((status, url) => {
        if (status === 'init') this.probeRelay(url);
      });
    }

    return true;
  }

  /**
   * Get Holster instance
   * @throws {GunError} If Holster is not initialized
   */
  getGun(): GunInstance {
    if (!this.holster || !this.isInitialized) {
      throw {
        code: GunErrorCode.INIT_FAILED,
        message: 'Holster not initialized. Call initialize() first.',
      } as GunError;
    }
    return this.holster;
  }

  /**
   * Get connection state
   */
  getConnectionState(): 'connected' | 'disconnected' | 'connecting' {
    const statuses = Array.from(this.relays.values());

    // Return 'connected' if ANY peer is connected
    if (statuses.some(s => s === 'connected')) {
      return 'connected';
    }
    // Return 'connecting' if ANY peer is connecting
    if (statuses.some(s => s === 'connecting')) {
      return 'connecting';
    }
    // Otherwise disconnected
    return 'disconnected';
  }

  /**
   * Get configured relay URL (deprecated, kept for backward compatibility)
   * @returns First relay URL or null if not configured
   */
  getRelayUrl(): string | null {
    const urls = Array.from(this.relays.keys());
    return urls.length > 0 ? urls[0] : null;
  }

  /**
   * Update Holster configuration with new relay list
   * @param relayUrls - Array of relay URLs to connect to
   */
  updateRelays(relayUrls: string[]): void {
    console.log('[DEBUG] updateRelays() called with:', relayUrls);
    if (!this.holster) {
      console.log('[DEBUG] updateRelays() - no holster instance, returning');
      return;
    }

    // Initialize status for each new relay
    relayUrls.forEach(url => {
      if (!this.relays.has(url)) {
        console.log('[DEBUG] Adding new relay to map:', url);
        this.relays.set(url, 'init');
      }
    });

    // Remove relays that are no longer configured
    for (const url of this.relays.keys()) {
      if (!relayUrls.includes(url)) {
        this.relays.delete(url);
        this.peerConnectionTimes.delete(url);
      }
    }

    // Save to localStorage (already in ws:// format)
    this.saveRelaySettings(relayUrls);

    // Register new relays for probing before updating Holster's peers; a
    // false return means nothing new to monitor, so skip the redundant opt()
    if (!this.setupConnectionMonitoring()) {
      console.log('[DEBUG] Skipping redundant call to holster.opt()');
      return;
    }

    // Use Holster's opt() method to update peers dynamically
    console.log('[DEBUG] Calling holster.opt() with peers:', relayUrls);
    this.holster.opt({ peers: relayUrls });
  }

  /**
   * Get relay URLs (Map keys)
   * @returns Array of relay URLs
   */
  getRelayUrls(): string[] {
    return Array.from(this.relays.keys());
  }

  /**
   * Get relay status map
   * @returns Map of relay URLs to connection status
   */
  getRelayStatuses(): Map<
    string,
    'init' | 'connecting' | 'connected' | 'disconnected'
  > {
    return this.relays;
  }

  /**
   * Get connection time for a specific peer
   * @param url - Relay URL
   * @returns Connection timestamp or undefined
   */
  getPeerConnectionTime(url: string): number | undefined {
    return this.peerConnectionTimes.get(url);
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
    const relaySettings = localStorage.getItem('relaySettings');
    return relaySettings ? JSON.parse(relaySettings) : [this.getDefaultRelay()];
  }

  /**
   * Reset relay settings to defaults
   * Removes relaySettings from localStorage, app will use default on next reload
   */
  resetRelays(): void {
    localStorage.removeItem('relaySettings');
    console.log('[DEBUG] Reset relay settings - removed from localStorage');
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
  async writeProfile(): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      const holster = this.getGun();
      const userNode = holster.user();
      const userState = userNode.is;

      if (!userState || !('epub' in userState) || !userState.epub) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'User session not available or ECDH key missing'
        );
      }

      const profileData: { epub: string; username?: string } = {
        epub: userState.epub,
      };

      if (userState.username && typeof userState.username === 'string') {
        profileData.username = userState.username;
      }

      await new Promise<void>((resolve, reject) => {
        userNode.get('profile').put(profileData, (ack: GunAck) => {
          if (ack && typeof ack === 'object' && ack.err) {
            reject(new Error(`Profile storage failed: ${ack.err}`));
          } else {
            resolve();
          }
        });
      });
    }, transformGunError);
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
      this.getGun().wire.get({'#': soul}, msg => {
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
  async readUsername(): Promise<Result<string, GunError>> {
    return tryCatch<string, GunError>(async () => {
      const userNode = this.getGun().user();
      const userState = userNode.is;

      if (!userState || !userState.pub) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
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
      throw createGunError(
        GunErrorCode.MISC_ERROR,
        'Username not found in user profile'
      );
    }, transformGunError);
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
  ): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      if (!this.holster) {
        throw createGunError(GunErrorCode.INIT_FAILED, 'Holster not initialized');
      }

      await new Promise<void>((resolve, reject) => {
        const holster = this.holster!;
        holster.user().create(username, password, ack => {
          if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
            reject(new Error(`User creation failed: ${String(ack.err)}`));
          } else {
            resolve();
          }
        });
      });
    }, transformGunError);
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
  ): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      if (!this.holster) {
        throw createGunError(GunErrorCode.INIT_FAILED, 'Holster not initialized');
      }

      await new Promise<void>((resolve, reject) => {
        const holster = this.holster!;
        holster.user().auth(username, password, ack => {
          if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
            reject(new Error(`Authentication failed: ${String(ack.err)}`));
          } else {
            resolve();
          }
        });
      });
    }, transformGunError);
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
  ): Promise<Result<DiscoveredUser[], GunError>> {
    return tryCatch<DiscoveredUser[], GunError>(async () => {
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
    }, transformGunError);
  }

  /**
   * List out all items at a specific node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listItems(
    nodePath: string[],
    startNode?: GunUserNode | GunInstance
  ): Promise<Result<ListItemResult[], GunError>> {
    return tryCatch<ListItemResult[], GunError>(async () => {
      const holster = this.getGun();
      if (nodePath.length === 0) {
        return [];
      }
      const items = await new Promise<ListItemResult[]>(resolve => {
        const [first, ...rest] = nodePath;
        let node: GunNodeRef = (startNode ?? holster).get(first);
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
    }, transformGunError);
  }

  /**
   * List out all items at a specific user node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listUserItems(
    nodePath: string[]
  ): Promise<Result<ListItemResult[], GunError>> {
    return await this.listItems(nodePath, this.getGun().user());
  }

  /**
   * Hash a path part for private data storage
   * Reference: code_references/holster.md
   * @param plainPath - Plain text path part to hash
   * @returns Promise resolving to hashed path string
   */
  async getPrivatePathPart(
    plainPath: string
  ): Promise<Result<string, GunError>> {
    return tryCatch<string, GunError>(async () => {
      const SEA = this.getGun().SEA;
      if (!SEA) {
        throw createGunError(GunErrorCode.MISC_ERROR, 'SEA not available');
      }
      const holster = this.getGun();
      const user = holster.user();

      const sea = getUserSEA(user);
      if (!sea) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'User cryptographic keypair not available'
        );
      }

      const result = await SEA.work(plainPath, sea);
      if (!result || !result.epriv) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'Failed to hash path part'
        );
      }
      // SEA.work returns an {epriv} pair object — .epriv is the hashed
      // string. Returning the object itself would make Holster coerce the
      // path via String(key) to '[object Object]', colliding every private
      // path into one node (see docs/memory.md).
      return result.epriv;
    }, transformGunError);
  }

  /**
   * Hash all path parts for private data storage
   * Reference: code_references/holster.md
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to array of hashed path strings
   */
  async getPrivatePath(
    plainPath: string[]
  ): Promise<Result<string[], GunError>> {
    const pathResults: Result<string, GunError>[] = await Promise.all(
      plainPath.map(p => this.getPrivatePathPart(p))
    );
    return sequence(pathResults);
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
  ): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      const holster = this.getGun();
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      const privatePath = privatePathResult.data;

      const [first, ...rest] = privatePath;
      let node: GunNodeRef = holster.user().get(first);
      for (const part of rest) {
        node = node.next(part);
      }

      await new Promise<void>((resolve, reject) => {
        const SEA = holster.SEA;
        const sea = getUserSEA(holster.user());
        if (!sea) {
          reject(new Error('User cryptographic keypair not available'));
          return;
        }

        SEA?.encrypt(plaintext, sea)
          .then(ciphertext => {
            if (!ciphertext) {
              reject(new Error('SEA.encrypt failed: returned null'));
              return;
            }

            node.put(ciphertext, (ack: GunAck) => {
              if (ack && typeof ack === 'object' && ack.err) {
                reject(
                  createGunError(
                    GunErrorCode.MISC_ERROR,
                    'Failed to write private data',
                    ack.err
                  )
                );
              } else {
                resolve();
              }
            });
          })
          .catch(reject);
      });
    }, transformGunError);
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
  ): Promise<Result<string, GunError>> {
    return tryCatch<string, GunError>(async () => {
      const holster = this.getGun();
      const pathResult = await this.getPrivatePath(plainPath);
      if (!pathResult.success) {
        throw pathResult.error;
      }
      const path = hashedPath || pathResult.data;

      const [first, ...rest] = path;
      let node: GunNodeRef = holster.user().get(first);
      for (const part of rest) {
        node = node.next(part);
      }

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
    }, transformGunError);
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
  ): Promise<Result<Record<string, string>[], GunError>> {
    return tryCatch<Record<string, string>[], GunError>(async () => {
      const holster = this.getGun();
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      const privatePath = privatePathResult.data;
      const user = holster.user();
      const [first, ...rest] = privatePath;
      let privateNode: GunNodeRef = user.get(first);
      for (const part of rest) {
        privateNode = privateNode.next(part);
      }

      const keys: string[] = await new Promise<string[]>(resolve => {
        privateNode.next(null, (data: unknown) => {
          if (!data || typeof data !== 'object') {
            resolve([]);
            return;
          }

          const nodeKeys = Object.keys(data || {}).filter(k => k !== '_' && (data as Record<string, unknown>)[k] != null);
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
      failures.forEach(({ error }) =>
        console.error('Failed to read contact:', error)
      );

      return successes.filter(record => Object.keys(record).length > 0);
    }, transformGunError);
  }

  /**
   * Delete encrypted private data from user storage
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to void
   */
  async deletePrivateData(
    plainPath: string[]
  ): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      const holster = this.getGun();
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      const privatePath = privatePathResult.data;

      const [first, ...rest] = privatePath;
      let node: GunNodeRef = holster.user().get(first);
      for (const part of rest) {
        node = node.next(part);
      }

      await new Promise<void>((resolve, reject) => {
        node.put(null, (ack: GunAck) => {
          if (ack && typeof ack === 'object' && ack.err) {
            reject(new Error(`Failed to delete private data: ${ack.err}`));
          } else {
            resolve();
          }
        });
      });
    }, transformGunError);
  }

  async logoutAndWait(): Promise<Result<void, GunError>> {
    return tryCatch<void, GunError>(async () => {
      const gun = this.getGun();
      gun.user().leave();
      await retryWithBackoff(
        async _ => {
          if (gun.user().is) {
            throw new Error('user is not logging out');
          }
        },
        {
          maxAttempts: 6,
          baseDelay: 100,
          backoffMultiplier: 1.5,
        }
      );
    }, transformGunError);
  }

  /**
   * Wait for user state to be set (for authentication)
   * @returns Promise resolving to user pub key
   */
  public async waitForUserState(): Promise<Result<string, GunError>> {
    return tryCatch<string, GunError>(async () => {
      const gun = this.getGun();
      await retryWithBackoff(
        async _ => {
          const user = gun.user();
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
      const user = gun.user();
      return user.is!.pub as string;
    }, transformGunError);
  }
}

// Export singleton instance
export const gunService = new GunService();

// Export class for testing
export { GunService };
