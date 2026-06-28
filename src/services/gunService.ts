/**
 * GunDB Service
 *
 * Service layer for GunDB operations including initialization,
 * user management, and some read/write methods.
 */

import Gun from '@mblaney/holster/src/holster.js';
import { retryWithBackoff } from '@/lib/retry';
import { getUserSEA } from '@/misc/seaHelpers';
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
import type { ISEAPair } from '@/misc/seaHelpers';

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
 * GunDB Service Class
 *
 * All GunDB paths are namespaced with the app name to avoid collisions
 * when multiple applications share the same GunDB relay server.
 * Default namespace: 'markdownmywords'
 */
class GunService {
  holster: GunInstance | null = null;
  isInitialized = false;
  appNamespace: string = 'markdownmywords';
  relays: Map<string, 'init' | 'connecting' | 'connected' | 'disconnected'> =
    new Map();
  peerConnectionTimes: Map<string, number> = new Map();

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
   * Gets a namespaced graph path to the node
   * @param parts - array of path parts
   * @returns Namespaced node
   */
  public getNodePath(...parts: string[]): GunNodeRef {
    let node = this.getGun().get(this.appNamespace);
    for (const p of parts) {
      if (!p || p.length === 0) {
        const gunError: GunError = {
          code: GunErrorCode.INVALID_DATA,
          message: 'Every path part must be non-empty string',
          details: null,
        };
        throw gunError;
      }
      node = node.get(p);
    }
    return node;
  }

  /**
   * Set up connection state monitoring
   */
  setupConnectionMonitoring(): boolean {
    console.log('[DEBUG] setupConnectionMonitoring() called', this.relays);
    if (!this.holster) {
      console.log(
        '[DEBUG] setupConnectionMonitoring() - no holster instance, returning'
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

    this.holster.on('hi', peer => {
      console.log('[DEBUG] hi event fired, peer:', peer);
      if (peer.url && this.relays.has(peer.url)) {
        this.relays.set(peer.url, 'connected');
        this.peerConnectionTimes.set(peer.url, Date.now());

        const timeout = timeouts.get(peer.url);
        if (timeout) {
          clearTimeout(timeout);
          timeouts.delete(peer.url);
        }

        console.log(`Holster peer connected: ${peer.url}`);
      }
    });

    this.holster.on('bye', peer => {
      console.log('[DEBUG] bye event fired, peer:', peer);
      if (peer.url && this.relays.has(peer.url)) {
        this.relays.set(peer.url, 'disconnected');
        console.log(`Holster peer disconnected: ${peer.url}`);
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

    // Restart connection monitoring (set up hi/bye listeners BEFORE connecting)
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
   * Stores the user's epub and username at their user node's profile sub-path
   * Reference: code_references/gundb.md:49-58
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

      if (userState.alias && typeof userState.alias === 'string') {
        profileData.username = userState.alias;
      }

      await new Promise<void>((resolve, reject) => {
        userNode.get('profile').put(profileData, (ack: GunAck) => {
          if (ack.err) {
            reject(new Error(`Profile storage failed: ${ack.err}`));
          } else {
            resolve();
          }
        });
      });
    }, transformGunError);
  }

  /**
   * Read username from user profile for session restoration
   * @returns Promise resolving to username string
   */
  async readUsername(): Promise<Result<string, GunError>> {
    return tryCatch<string, GunError>(async () => {
      const holster = this.getGun();
      const userNode = holster.user();
      const userState = userNode.is;

      if (!userState || !userState.pub) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'User session not available'
        );
      }

      const username = await new Promise<string>((resolve, reject) => {
        holster.get(`~${userState.pub}`).get((data: unknown) => {
          if (
            data &&
            typeof data === 'object' &&
            'profile' in data &&
            data.profile &&
            typeof data.profile === 'object' &&
            'username' in data.profile
          ) {
            resolve((data.profile as { username: string }).username);
          } else {
            reject(new Error('Username not found in user profile'));
          }
        });
      });
      return username;
    }, transformGunError);
  }

  /**
   * Create user with SEA
   * Reference: code_references/gundb.md:26-35
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
   * Reference: code_references/gundb.md:37-47
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
   * Reference: code_references/gundb.md:76-93
   * @param username - Username to search for
   * @returns Promise resolving to array of discovered user profiles
   */
  async discoverUsers(
    username: string
  ): Promise<Result<DiscoveredUser[], GunError>> {
    return tryCatch<DiscoveredUser[], GunError>(async () => {
      const holster = this.getGun();
      const profiles = await new Promise<DiscoveredUser[]>(resolve => {
        holster
          .get(`~@${username}`)
          .get((data: unknown) => {
            if (!data || typeof data !== 'object') {
              resolve([]);
              return;
            }

            const entries = Object.entries(data || {})
              .filter(([k, v]) => k !== '_' && v != null)
              .map(([pub, profileData]) => ({
                soul: pub,
                data: profileData,
              }));

            const collectedProfiles: DiscoveredUser[] = [];

            Promise.all(
              entries.map(entry =>
                new Promise<void>(resolveProfile => {
                  const cleanPub = entry.soul.startsWith('~')
                    ? entry.soul.slice(1)
                    : entry.soul;
                  holster.get(`~${cleanPub}`).get((userNode: unknown) => {
                    collectedProfiles.push({
                      pub: cleanPub,
                      data: entry.data,
                      userNode,
                    });
                    resolveProfile();
                  });
                })
              )
            ).then(() => resolve(collectedProfiles));
          });
      });
      return profiles;
    }, transformGunError);
  }

  /**
   * List out all items at a specific node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listItems(
    nodePath: string[],
    startNode?: GunNodeRef | GunUserNode
  ): Promise<Result<ListItemResult[], GunError>> {
    return tryCatch<ListItemResult[], GunError>(async () => {
      const holster = this.getGun();
      const items = await new Promise<ListItemResult[]>(resolve => {
        const node = nodePath.reduce(
          (n, part) => (n as GunNodeRef).get(part),
          startNode ?? holster
        ) as GunNodeRef;

        node.get((data: unknown) => {
          if (!data || typeof data !== 'object') {
            resolve([]);
            return;
          }

          const entries = Object.entries(data || {})
            .filter(([k, v]) => k !== '_' && v != null)
            .map(([soul, data]) => ({ soul, data }));

          const collectedItems: ListItemResult[] = [];

          Promise.all(
            entries.map(entry =>
              new Promise<void>(resolveItem => {
                const cleanSoul = entry.soul.startsWith('~')
                  ? entry.soul.slice(1)
                  : entry.soul;
                holster.get(`~${cleanSoul}`).get((node: unknown) => {
                  const typedData: string | Record<string, unknown> =
                    typeof entry.data === 'string'
                      ? entry.data
                      : (entry.data as Record<string, unknown>);
                  collectedItems.push({
                    soul: cleanSoul,
                    data: typedData,
                    node,
                  });
                  resolveItem();
                });
              })
            )
          ).then(() => resolve(collectedItems));
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
   * Reference: code_references/gundb.md:103-113
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

      if (
        !user._ ||
        typeof user._ !== 'object' ||
        !('sea' in user._) ||
        !user._.sea
      ) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'User cryptographic keypair not available'
        );
      }

      const sea = user._.sea as ISEAPair;
      const result = await SEA.work(plainPath, sea);
      if (!result) {
        throw createGunError(
          GunErrorCode.MISC_ERROR,
          'Failed to hash path part'
        );
      }
      return result;
    }, transformGunError);
  }

  /**
   * Hash all path parts for private data storage
   * Reference: code_references/gundb.md:115-119
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
   * Reference: code_references/gundb.md:121-145
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

      const node = privatePath.reduce(
        (path: unknown, part) => (path as GunNodeRef).get(part),
        holster.user()
      ) as GunNodeRef;

      await new Promise<void>((resolve, reject) => {
        const SEA = holster.SEA;
        const sea = getUserSEA(holster.user());
        if (!sea) {
          reject(new Error('User cryptographic keypair not available'));
          return;
        }

        SEA?.encrypt(plaintext, sea)
          .then((ciphertext: string | undefined) => {
            if (!ciphertext) {
              reject(new Error('SEA.encrypt failed: returned undefined'));
              return;
            }

            const putNode = node as {
              put: (data: unknown, cb?: (ack: GunAck) => void) => void;
            };
            putNode.put(ciphertext, (ack: GunAck) => {
              if (ack.err) {
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
   * Reference: code_references/gundb.md:147-165
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

      const node = path.reduce(
        (p: unknown, part) => (p as GunNodeRef).get(part),
        holster.user()
      ) as GunNodeRef;

      const plaintext = await new Promise<string>((resolve, reject) => {
        const sea = getUserSEA(holster.user());
        if (!sea) {
          reject(new Error('User cryptographic keypair not available'));
          return;
        }

        const onceNode = node as {
          once: (cb: (data: unknown) => void) => void;
        };
        onceNode.once(async (ciphertext: unknown) => {
          if (ciphertext === undefined) {
            reject(
              new Error('Private data not found or could not be decrypted')
            );
          } else {
            const SEA = holster.SEA;
            const plaintext = await SEA?.decrypt(ciphertext as string, sea);
            resolve(plaintext);
          }
        });
      });
      return plaintext;
    }, transformGunError);
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
  ): Promise<Result<Record<string, string>[], GunError>> {
    return tryCatch<Record<string, string>[], GunError>(async () => {
      const holster = this.getGun();
      const privatePathResult = await this.getPrivatePath(plainPath);
      if (!privatePathResult.success) {
        throw privatePathResult.error;
      }
      const privatePath = privatePathResult.data;
      const user = holster.user();
      let privateNode: unknown = user;
      for (const part of privatePath) {
        const getNode = (privateNode as Record<string, unknown>).get as (
          key: string
        ) => unknown;
        privateNode = getNode(part);
      }

      const keys: string[] = await new Promise<string[]>(resolve => {
        const getNode = (privateNode as Record<string, unknown>).get as (
          callback: (data: unknown) => void
        ) => void;
        getNode((data: unknown) => {
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

      const node = privatePath.reduce(
        (path: unknown, part) => (path as GunNodeRef).get(part),
        holster.user()
      ) as GunNodeRef;

      await new Promise<void>((resolve, reject) => {
        const putNode = node as {
          put: (data: unknown, cb?: (ack: GunAck) => void) => void;
        };
        putNode.put(null, (ack: GunAck) => {
          if (ack.err) {
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
