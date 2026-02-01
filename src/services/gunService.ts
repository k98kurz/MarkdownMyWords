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
import type { GunInstance, GunConfig, GunError } from '../types/gun';
import { GunErrorCode, GunNodeRef } from '../types/gun';
import type { IGunUserInstance } from 'gun/types';

export interface SEAUser {
  alias: string;
  pub: string; // Public key
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
  connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  appNamespace: string = 'markdownmywords';

  /**
   * Initialize GunDB client
   * @param relayUrl - Relay server URL (optional, defaults to local relay)
   * @param config - Additional GunDB configuration
   */
  initialize(relayUrl?: string, config?: GunConfig): void {
    if (this.isInitialized) {
      console.warn('GunDB already initialized');
      return;
    }

    try {
      // Set app namespace for collision avoidance
      this.appNamespace = config?.appNamespace ?? 'markdownmywords';

      const peers: string[] = [];

      if (relayUrl) {
        peers.push(relayUrl);
      } else if (config?.relayUrl) {
        peers.push(config.relayUrl);
      } else if (config?.peers) {
        peers.push(...config.peers);
      }

      // Default to local relay if no peers specified
      if (peers.length === 0) {
        peers.push('http://localhost:8765/gun');
      }

      const gunConfig: {
        peers: string[];
        localStorage?: boolean;
        radisk?: boolean;
      } = {
        peers,
        localStorage: config?.localStorage ?? true,
        radisk: config?.radisk ?? true, // Enable IndexedDB storage
      };

      this.gun = Gun(gunConfig) as GunInstance;

      // Set up connection state monitoring
      this.setupConnectionMonitoring();

      this.isInitialized = true;
      console.log('GunDB initialized successfully', {
        peers,
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
  setupConnectionMonitoring(): void {
    if (!this.gun) return;

    // Monitor peer connections
    // Note: GunDB doesn't have a built-in connection state API,
    // so we'll track it based on operations
    this.connectionState = 'connecting';

    // Try a test operation to verify connection (using namespaced path)
    this.gun
      .get(this.getNodePath('_connection_test'))
      .put({ timestamp: Date.now() }, (ack: any) => {
        if (ack.err) {
          this.connectionState = 'disconnected';
          console.warn('GunDB connection test failed:', ack.err);
          this.handleOffline();
        } else {
          this.connectionState = 'connected';
          console.log('GunDB connection established');
        }
      });

    // Set up periodic connection health checks
    setInterval(() => {
      if (!this.gun) return;

      this.gun
        .get(this.getNodePath('_health_check'))
        .put({ timestamp: Date.now() }, (ack: any) => {
          if (ack.err && this.connectionState === 'connected') {
            this.connectionState = 'disconnected';
            this.handleOffline();
          } else if (!ack.err && this.connectionState === 'disconnected') {
            this.connectionState = 'connected';
            console.log('GunDB connection restored');
          }
        });
    }, 30000); // Check every 30 seconds
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
    return this.connectionState;
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
    node: any,
    callback: (value: T | null) => void,
    retryDelay = 500
  ): void {
    let retried = false;
    const readOnce = () => {
      node.once((value: T | null) => {
        if (value !== null && value !== undefined) {
          callback(value);
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
   * Handle offline scenarios
   * GunDB automatically handles offline with IndexedDB, but we can add custom logic
   */
  handleOffline(): void {
    if (this.connectionState === 'connected') {
      this.connectionState = 'disconnected';
      console.warn('GunDB went offline - using local storage');
    }
  }

  /**
   * Check if currently offline
   * @returns true if offline, false if online
   */
  isOffline(): boolean {
    return this.connectionState === 'disconnected';
  }

  /**
   * Retry connection
   * Attempts to reconnect to peers
   */
  async retryConnection(): Promise<void> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    this.connectionState = 'connecting';

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionState = 'disconnected';
        reject({
          code: GunErrorCode.CONNECTION_FAILED,
          message: 'Connection retry timeout',
        } as GunError);
      }, 10000);

      this.gun!.get(this.getNodePath('_retry_test')).put(
        { timestamp: Date.now() },
        (ack: any) => {
          clearTimeout(timeout);

          if (ack.err) {
            this.connectionState = 'disconnected';
            reject({
              code: GunErrorCode.CONNECTION_FAILED,
              message: 'Failed to reconnect',
              details: ack.err,
            } as GunError);
          } else {
            this.connectionState = 'connected';
            resolve();
          }
        }
      );
    });
  }

  /**
   * Write user profile for discovery by other users
   * Stores the user's epub at their user node
   * Reference: code_references/gundb.md:49-58
   */
  async writeProfile(): Promise<void> {
    const gun = this.getGun();
    return new Promise<void>((resolve, reject) => {
      gun.user().put({ epub: (gun.user().is as any)?.epub }, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Profile storage failed: ${ack.err}`));
        } else {
          resolve();
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
      gun.user().create(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(`User creation failed: ${ack.err}`));
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
      gun.user().auth(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Authentication failed: ${ack.err}`));
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
  async discoverUsers(username: string): Promise<any[]> {
    const gun = this.getGun();
    return new Promise<any[]>(resolve => {
      const collectedProfiles: any[] = [];
      setTimeout(() => resolve(collectedProfiles), 500);

      gun
        .get(`~@${username}`)
        .map()
        .once((data: any, pub: string) => {
          if (!data) return;
          const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub;
          gun.get(`~${cleanPub}`).once((userNode: any) => {
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
  ): Promise<any[]> {
    const gun = this.getGun();
    return new Promise<any[]>(resolve => {
      const collectedItems: any[] = [];
      setTimeout(() => resolve(collectedItems), 500);

      const node = nodePath.reduce(
        (n, part) => (n as GunNodeRef).get(part),
        startNode ?? gun
      ) as GunNodeRef;

      node.map().once((data: any, soul: string) => {
        if (!data) return;
        const cleanSoul = soul.startsWith('~') ? soul.slice(1) : soul;
        gun.get(`~${cleanSoul}`).once((node: any) => {
          collectedItems.push({ soul: cleanSoul, data, node });
        });
      });
    });
  }

  /**
   * List out all items at a specific user node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listUserItems(nodePath: string[]): Promise<any[]> {
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
    const sea = (user as any)._?.sea;
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
    const user = gun.user();
    let node: any = user;
    for (const part of privatePath) {
      node = node.get(part);
    }

    return new Promise<void>(async (resolve, reject) => {
      const sea = (user as any)._?.sea;
      if (!sea) {
        reject(new Error('User cryptographic keypair not available'));
        return;
      }

      const SEA = Gun.SEA;
      const ciphertext = await SEA?.encrypt(plaintext, sea);
      if (!ciphertext) {
        reject(new Error('SEA.encrypt failed: returned undefined'));
        return;
      }

      node.put(ciphertext, (ack: any) => {
        if (ack && ack.err) {
          reject(new Error(`Failed to write private data: ${ack.err}`));
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
    const user = gun.user();
    let node: any = user;
    for (const part of path) {
      node = node.get(part);
    }

    return await new Promise<string>((resolve, reject) => {
      node.once(async (ciphertext: any) => {
        if (ciphertext === undefined) {
          reject(new Error('Private data not found or could not be decrypted'));
        } else {
          const SEA = Gun.SEA;
          const sea = (user as any)._?.sea;
          const plaintext = await SEA?.decrypt(ciphertext, sea);
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
    let privateNode: any = user;
    for (const part of privatePath) {
      privateNode = privateNode.get(part);
    }

    const keys: string[] = await new Promise<string[]>(resolve => {
      const collectedKeys: string[] = [];
      setTimeout(() => resolve(collectedKeys), 500);

      privateNode.map().once((_data: any, key: string) => {
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
      this.gun!.user().auth(username, password, async (ack: any) => {
        // Check for explicit error from GunDB
        if (ack.err) {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Invalid username or password',
            details: ack.err,
          } as GunError);
          return;
        }

        // Check if user is already authenticated
        const user = this.gun!.user();

        // If user.is is set with a pub key, authentication succeeded
        // no idea why it needs two different success cases, but it breaks without them both
        if (user.is && user.is.pub) {
          const userData: SEAUser = {
            alias: username,
            pub: user.is.pub as string,
          };
          resolve(userData);
        }

        // If ack.ok !== undefined, login succeeded
        if (ack.ok !== undefined) {
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
