/**
 * GunDB Service
 *
 * Service layer for GunDB operations including initialization,
 * user management, and some read/write methods.
 */

import Gun from 'gun';
import 'gun/sea'; // GunDB SEA for encryption
import 'gun/lib/radix'; // Radix for storage
import 'gun/lib/radisk'; // Radisk for IndexedDB
import { retryWithBackoff } from '../utils/retryHelper';
import { getUserSEA } from '../utils/seaHelpers';
import type { GunInstance, GunConfig, GunError } from '../types/gun';
import { GunErrorCode, GunNodeRef, GunAck } from '../types/gun';
import type { IGunUserInstance, ISEAPair } from 'gun/types';

export interface SEAUser {
  alias: string;
  pub: string; // Public key
}

export interface ListItemResult {
  soul: string;
  data: string | Record<string, unknown>;
  node: unknown;
}

export interface DiscoveredUser {
  pub: string;
  data: unknown;
  userNode: unknown;
}

/**
 * GunDB Service Class
 *
 * All GunDB paths are namespaced with the app name to avoid collisions
 * when multiple applications share the same GunDB relay server.
 * Default namespace: 'markdownmywords'
 */
class GunService {
  gun: GunInstance | null = null;
  isInitialized = false;
  appNamespace: string = 'markdownmywords';
  relays: Map<string, 'init' | 'connecting' | 'connected' | 'disconnected'> =
    new Map();
  peerConnectionTimes: Map<string, number> = new Map();

  /**
   * Initialize GunDB client
   * @param config - Additional GunDB configuration
   */
  initialize(config?: GunConfig): void {
    if (this.isInitialized) {
      console.warn('GunDB already initialized');
      return;
    }

    try {
      // Set app namespace for collision avoidance
      this.appNamespace = config?.appNamespace ?? 'markdownmywords';

      // Read relay settings from localStorage
      const relaySettings = localStorage.getItem('relaySettings');
      const relayUrls: string[] = relaySettings
        ? JSON.parse(relaySettings)
        : ['http://localhost:8765/gun'];

      // Initialize all relays as connecting
      relayUrls.forEach(url => {
        this.relays.set(url, 'init');
      });

      console.log('[DEBUG] Initializing GunDB with relays:', relayUrls);

      const gunConfig: {
        peers: string[];
        localStorage?: boolean;
        radisk?: boolean;
      } = {
        peers: relayUrls,
        localStorage: config?.localStorage ?? true,
        radisk: config?.radisk ?? true, // Enable IndexedDB storage
      };

      this.gun = Gun(gunConfig) as GunInstance;

      // Set up connection state monitoring
      console.log(
        '[DEBUG] Initializing GunDB - calling setupConnectionMonitoring()'
      );
      this.setupConnectionMonitoring();

      this.isInitialized = true;
      console.log('GunDB initialized successfully', {
        relayUrls,
        appNamespace: this.appNamespace,
      });
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'Failed to initialize GunDB',
        details: error,
      };
      throw gunError;
    }
  }

  /**
   * Get namespaced path for a node type
   * All paths are prefixed with app namespace to avoid collisions
   * @param nodeType - Node type (e.g., 'user', 'doc', 'branch')
   * @param id - Node ID(s)
   * @returns Namespaced path
   */
  public getNodePath(...parts: string[]): string {
    return `${this.appNamespace}~${parts.join('~')}`;
  }

  /**
   * Set up connection state monitoring
   */
  setupConnectionMonitoring(): boolean {
    console.log('[DEBUG] setupConnectionMonitoring() called', this.relays);
    if (!this.gun) {
      console.log(
        '[DEBUG] setupConnectionMonitoring() - no gun instance, returning'
      );
      return false;
    }

    // If no relay is configured, always be in disconnected state
    if (this.relays.size === 0) {
      console.log(
        '[DEBUG] No relay configured - running in local-only mode, returning early'
      );
      return false;
    }

    // if all relays have been initialized, return
    if (
      !Object.values([...this.relays.values()]).some(value => value === 'init')
    ) {
      console.log('[DEBUG] No relays in init state; returning');
      return false;
    }

    // Set all relays to connecting
    this.relays.forEach((_, url) => {
      this.relays.set(url, 'connecting');
    });

    console.log(`Connecting to ${this.relays.size} relay(s)`);
    console.log('Configured relay URLs:', Array.from(this.relays.keys()));

    const timeouts = new Map<string, number>();

    this.gun.on('hi', peer => {
      console.log('[DEBUG] hi event fired, peer:', peer);
      if (peer.url && this.relays.has(peer.url)) {
        this.relays.set(peer.url, 'connected');
        this.peerConnectionTimes.set(peer.url, Date.now());

        const timeout = timeouts.get(peer.url);
        if (timeout) {
          clearTimeout(timeout);
          timeouts.delete(peer.url);
        }

        console.log(`GunDB peer connected: ${peer.url}`);
      }
    });

    this.gun.on('bye', peer => {
      console.log('[DEBUG] bye event fired, peer:', peer);
      if (peer.url && this.relays.has(peer.url)) {
        this.relays.set(peer.url, 'disconnected');
        console.log(`GunDB peer disconnected: ${peer.url}`);
      }
    });

    // Set connection timeout - 10 seconds for each relay
    this.relays.forEach((_, url) => {
      console.log('[DEBUG] Setting 10s timeout for relay:', url);
      const timeout = window.setTimeout(() => {
        console.log(
          '[DEBUG] Timeout triggered for relay:',
          url,
          'Current status:',
          this.relays.get(url)
        );
        if (this.relays.get(url) === 'connecting') {
          this.relays.set(url, 'disconnected');
          console.warn(`GunDB connection timed out: ${url}`);
        }
      }, 10000);
      timeouts.set(url, timeout);
    });

    return true;
  }

  /**
   * Get GunDB instance
   * @throws {GunError} If GunDB is not initialized
   */
  getGun(): GunInstance {
    if (!this.gun || !this.isInitialized) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized. Call initialize() first.',
      } as GunError;
    }
    return this.gun;
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
   * Update GunDB configuration with new relay list
   * @param relayUrls - Array of relay URLs to connect to
   */
  updateRelays(relayUrls: string[]): void {
    console.log('[DEBUG] updateRelays() called with:', relayUrls);
    if (!this.gun) {
      console.log('[DEBUG] updateRelays() - no gun instance, returning');
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

    // Save to localStorage
    this.saveRelaySettings(relayUrls);

    // Restart connection monitoring (set up hi/bye listeners BEFORE connecting)
    if (!this.setupConnectionMonitoring()) {
      console.log('[DEBUG] Skipping redundant call to gun.opt()');
      return;
    }

    // Use GunDB's opt() method to update peers dynamically
    console.log('[DEBUG] Calling gun.opt() with peers:', relayUrls);
    this.gun.opt({ peers: relayUrls });
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
    localStorage.setItem('relaySettings', JSON.stringify(relayUrls));
    console.log('[DEBUG] Saved relay settings to localStorage:', relayUrls);
  }

  /**
   * Get stored relay settings from localStorage
   * @returns Array of relay URLs from localStorage or default
   */
  getStoredRelays(): string[] {
    const relaySettings = localStorage.getItem('relaySettings');
    return relaySettings
      ? JSON.parse(relaySettings)
      : ['http://localhost:8765/gun'];
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
    return this.isInitialized && this.gun !== null;
  }

  /**
   * Helper to read a value with one retry (500ms delay)
   * Returns the value or null if not found after retry
   */
  readWithRetry<T>(
    node: GunNodeRef,
    callback: (value: T | null) => void,
    retryDelay = 500
  ): void {
    let retried = false;
    const readOnce = () => {
      node.once((value: unknown) => {
        if (value !== null && value !== undefined) {
          callback(value as T);
        } else if (!retried) {
          retried = true;
          setTimeout(readOnce, retryDelay);
        } else {
          callback(null);
        }
      });
    };
    readOnce();
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
   * Stores the user's epub and username at their user node
   * Reference: code_references/gundb.md:49-58
   */
  async writeProfile(): Promise<void> {
    const gun = this.getGun();
    const userNode = gun.user();
    const userState = userNode.is;

    if (!userState || !('epub' in userState) || !userState.epub) {
      throw new Error('User session not available or ECDH key missing');
    }

    const profileData: { epub: string; username?: string } = {
      epub: userState.epub,
    };

    if (userState.alias && typeof userState.alias === 'string') {
      profileData.username = userState.alias;
    }

    return new Promise<void>((resolve, reject) => {
      userNode.put(profileData, (ack: GunAck) => {
        if (ack.err) {
          reject(new Error(`Profile storage failed: ${ack.err}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read username from user profile for session restoration
   * @returns Promise resolving to username string
   */
  async readUsername(): Promise<string> {
    const gun = this.getGun();
    const userNode = gun.user();
    const userState = userNode.is;

    if (!userState || !userState.pub) {
      throw new Error('User session not available');
    }

    return new Promise<string>((resolve, reject) => {
      gun.get(`~${userState.pub}`).once((data: unknown) => {
        if (data && typeof data === 'object' && 'username' in data) {
          resolve((data as { username: string }).username);
        } else {
          reject(new Error('Username not found in user profile'));
        }
      });
    });
  }

  /**
   * Create user with SEA
   * Reference: code_references/gundb.md:26-35
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to void
   */
  async createUser(username: string, password: string): Promise<void> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    return new Promise<void>((resolve, reject) => {
      const gun = this.gun!;
      gun.user().create(username, password, (ack: unknown) => {
        if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
          reject(new Error(`User creation failed: ${String(ack.err)}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Authenticate user
   * Reference: code_references/gundb.md:37-47
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to void
   */
  async authenticateUser(username: string, password: string): Promise<void> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    return new Promise<void>((resolve, reject) => {
      const gun = this.gun!;
      gun.user().auth(username, password, (ack: unknown) => {
        if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
          reject(new Error(`Authentication failed: ${String(ack.err)}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Discover users who claim a specific username
   * Reference: code_references/gundb.md:76-93
   * @param username - Username to search for
   * @returns Promise resolving to array of discovered user profiles
   */
  async discoverUsers(username: string): Promise<DiscoveredUser[]> {
    const gun = this.getGun();
    return new Promise<DiscoveredUser[]>(resolve => {
      const collectedProfiles: DiscoveredUser[] = [];
      setTimeout(() => resolve(collectedProfiles), 500);

      gun
        .get(`~@${username}`)
        .map()
        .once((data: unknown, pub: string) => {
          if (!data) return;
          const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub;
          gun.get(`~${cleanPub}`).once((userNode: unknown) => {
            collectedProfiles.push({ pub: cleanPub, data, userNode });
          });
        });
    });
  }

  /**
   * List out all items at a specific node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listItems(
    nodePath: string[],
    startNode?: GunNodeRef | IGunUserInstance
  ): Promise<ListItemResult[]> {
    const gun = this.getGun();
    return new Promise<ListItemResult[]>(resolve => {
      const collectedItems: ListItemResult[] = [];
      setTimeout(() => resolve(collectedItems), 500);

      const node = nodePath.reduce(
        (n, part) => (n as GunNodeRef).get(part),
        startNode ?? gun
      ) as GunNodeRef;

      node.map().once((data: unknown, soul: string) => {
        if (!data) return;
        const cleanSoul = soul.startsWith('~') ? soul.slice(1) : soul;
        gun.get(`~${cleanSoul}`).once((node: unknown) => {
          const typedData: string | Record<string, unknown> =
            typeof data === 'string' ? data : (data as Record<string, unknown>);
          collectedItems.push({ soul: cleanSoul, data: typedData, node });
        });
      });
    });
  }

  /**
   * List out all items at a specific user node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listUserItems(nodePath: string[]): Promise<ListItemResult[]> {
    return await this.listItems(nodePath, this.getGun().user());
  }

  /**
   * Hash a path part for private data storage
   * Reference: code_references/gundb.md:103-113
   * @param plainPath - Plain text path part to hash
   * @returns Promise resolving to hashed path string
   */
  async getPrivatePathPart(plainPath: string): Promise<string> {
    const SEA = Gun.SEA;
    if (!SEA) {
      throw new Error('SEA not available');
    }
    const gun = this.getGun();
    const user = gun.user();

    if (
      !user._ ||
      typeof user._ !== 'object' ||
      !('sea' in user._) ||
      !user._.sea
    ) {
      throw new Error('User cryptographic keypair not available');
    }

    const sea = user._.sea as ISEAPair;
    const result = await SEA.work(plainPath, sea);
    if (!result) {
      throw new Error('Failed to hash path part');
    }
    return result;
  }

  /**
   * Hash all path parts for private data storage
   * Reference: code_references/gundb.md:115-119
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to array of hashed path strings
   */
  async getPrivatePath(plainPath: string[]): Promise<string[]> {
    return await Promise.all(
      plainPath.map(async (p: string) => await this.getPrivatePathPart(p))
    );
  }

  /**
   * Write encrypted private data to user storage
   * Reference: code_references/gundb.md:121-145
   * @param plainPath - Array of plain text path parts
   * @param plaintext - Data to encrypt and store
   * @returns Promise resolving to void
   */
  async writePrivateData(
    plainPath: string[],
    plaintext: string
  ): Promise<void> {
    const gun = this.getGun();
    const privatePath = await this.getPrivatePath(plainPath);

    const node = privatePath.reduce(
      (path: unknown, part) => (path as GunNodeRef).get(part),
      gun.user()
    ) as GunNodeRef;

    await new Promise<void>(async (resolve, reject) => {
      const SEA = Gun.SEA;
      const sea = getUserSEA(gun.user());
      if (!sea) {
        reject(new Error('User cryptographic keypair not available'));
        return;
      }

      const ciphertext = await SEA?.encrypt(plaintext, sea);
      if (!ciphertext) {
        reject(new Error('SEA.encrypt failed: returned undefined'));
        return;
      }

      const putNode = node as {
        put: (data: unknown, cb?: (ack: unknown) => void) => void;
      };
      putNode.put(ciphertext, (ack: unknown) => {
        if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
          reject(new Error(`Failed to write private data: ${String(ack.err)}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Read and decrypt private data from user storage
   * Reference: code_references/gundb.md:147-165
   * @param plainPath - Array of plain text path parts
   * @param hashedPath - Optional pre-hashed path (for internal use)
   * @returns Promise resolving to decrypted string
   */
  async readPrivateData(
    plainPath: string[],
    hashedPath?: string[]
  ): Promise<string> {
    const gun = this.getGun();
    const path = hashedPath || (await this.getPrivatePath(plainPath));

    const node = path.reduce(
      (p: unknown, part) => (p as GunNodeRef).get(part),
      gun.user()
    ) as GunNodeRef;

    return await new Promise<string>((resolve, reject) => {
      const sea = getUserSEA(gun.user());
      if (!sea) {
        reject(new Error('User cryptographic keypair not available'));
        return;
      }

      const onceNode = node as { once: (cb: (data: unknown) => void) => void };
      onceNode.once(async (ciphertext: unknown) => {
        if (ciphertext === undefined) {
          reject(new Error('Private data not found or could not be decrypted'));
        } else {
          const SEA = Gun.SEA;
          const plaintext = await SEA?.decrypt(ciphertext as string, sea);
          resolve(plaintext);
        }
      });
    });
  }

  /**
   * Read private structured data (like contacts) by iterating keys
   * Reference: code_references/gundb.md:167-215
   * @param plainPath - Array of plain text path parts
   * @param fields - Array of field names to read
   * @returns Promise resolving to array of private data records
   */
  async readPrivateMap(
    plainPath: string[],
    fields: string[]
  ): Promise<Record<string, string>[]> {
    const gun = this.getGun();
    const privatePath = await this.getPrivatePath(plainPath);
    const user = gun.user();
    let privateNode: unknown = user;
    for (const part of privatePath) {
      const getNode = (privateNode as Record<string, unknown>).get as (
        key: string
      ) => unknown;
      privateNode = getNode(part);
    }

    const keys: string[] = await new Promise<string[]>(resolve => {
      const collectedKeys: string[] = [];
      setTimeout(() => resolve(collectedKeys), 500);

      const mapNode = privateNode as {
        map: () => { once: (cb: (data: unknown, key: string) => void) => void };
      };
      mapNode.map().once((_data: unknown, key: string) => {
        if (key) {
          collectedKeys.push(key);
        }
      });
    });

    const results: Record<string, string>[] = [];
    for (const key of keys) {
      try {
        const record: Record<string, string> = {};
        for (const fieldName of fields) {
          const fieldNameHash = await this.getPrivatePathPart(fieldName);
          const fullHashedPath = [...privatePath, key, fieldNameHash];
          const fieldValue = await this.readPrivateData([], fullHashedPath);
          record[fieldName] = fieldValue;
        }
        if (Object.keys(record).length > 0) {
          results.push(record);
        }
      } catch (error: unknown) {
        console.error(
          `Failed to read contact for key ${key}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    return results;
  }

  /**
   * Authenticate user with SEA
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to SEAUser
   */
  async authenticateSEAUser(
    username: string,
    password: string
  ): Promise<SEAUser> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    return new Promise<SEAUser>((resolve, reject) => {
      // Authenticate user with SEA
      this.gun!.user().auth(username, password, async (ack: unknown) => {
        // Check for explicit error from GunDB
        if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Invalid username or password',
            details: ack.err,
          } as GunError);
          return;
        }

        // Check if user is already authenticated
        const user = this.gun!.user();
        const userState = user.is;

        // If user.is is set with a pub key, authentication succeeded
        // no idea why it needs two different success cases, but it breaks without them both
        if (userState && 'pub' in userState && userState.pub) {
          const userData: SEAUser = {
            alias: username,
            pub: userState.pub as string,
          };
          resolve(userData);
        }

        // If ack.ok !== undefined, login succeeded
        if (
          ack &&
          typeof ack === 'object' &&
          'ok' in ack &&
          ack.ok !== undefined
        ) {
          this.waitForUserState()
            .then(pub => {
              // Authentication actually succeeded despite ok: 0
              const userData: SEAUser = {
                alias: username,
                pub: pub,
              };
              resolve(userData);
            })
            .catch(data => {
              // Authentication really failed - wrong password
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Invalid username or password',
                details: 'Authentication failed',
                data: data,
              } as GunError);
            });
          return;
        }

        // Unexpected response - fail with user-friendly message
        reject({
          code: GunErrorCode.SYNC_ERROR,
          message: 'Invalid username or password',
          details: ack,
        } as GunError);
      });
    });
  }

  async logoutAndWait() {
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
  }

  /**
   * Wait for user state to be set (for authentication)
   * @returns Promise resolving to user pub key
   */
  public async waitForUserState(): Promise<string> {
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
  }
}

// Export singleton instance
export const gunService = new GunService();

// Export class for testing
export { GunService };
