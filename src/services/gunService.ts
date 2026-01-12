/**
 * GunDB Service
 *
 * Service layer for GunDB operations including initialization,
 * user management, document CRUD, and real-time subscriptions.
 */

import Gun from 'gun';
import 'gun/sea'; // GunDB SEA for encryption
import 'gun/lib/radix'; // Radix for storage
import 'gun/lib/radisk'; // Radisk for IndexedDB
import type {
  GunInstance,
  User,
  Document,
  Branch,
  GunConfig,
  DocumentCallback,
  UserCallback,
  BranchCallback,
  Unsubscribe,
  GunError,
} from '../types/gun';
import { GunErrorCode } from '../types/gun';

/**
 * SEA User interface
 */
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
  private gun: GunInstance | null = null;
  private isInitialized = false;
  private connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  private appNamespace: string = 'markdownmywords';

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
      console.log('GunDB initialized successfully', { peers, appNamespace: this.appNamespace });
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
  private getNodePath(nodeType: string, ...id: string[]): string {
    return `${this.appNamespace}~${nodeType}~${id.join('~')}`;
  }

  /**
   * Set up connection state monitoring
   */
  private setupConnectionMonitoring(): void {
    if (!this.gun) return;

    // Monitor peer connections
    // Note: GunDB doesn't have a built-in connection state API,
    // so we'll track it based on operations
    this.connectionState = 'connecting';

      // Try a test operation to verify connection (using namespaced path)
      this.gun.get(this.getNodePath('_connection_test')).put({ timestamp: Date.now() }, (ack: any) => {
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

      this.gun.get(this.getNodePath('_health_check')).put({ timestamp: Date.now() }, (ack: any) => {
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
  private getGun(): GunInstance {
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
   * Get user by ID
   * @param userId - User ID
   * @returns Promise resolving to User or null if not found
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      const gun = this.getGun();

      // If offline, still try to get from local storage
      const isOffline = this.isOffline();

      return new Promise<User | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (isOffline) {
            // In offline mode, return null but don't reject
            // Data might be in local storage but not synced yet
            resolve(null);
            return;
          }
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout waiting for user data',
          } as GunError);
        }, isOffline ? 5000 : 10000); // Shorter timeout when offline

        gun.get(this.getNodePath('user', userId)).once((data: User | null) => {
          clearTimeout(timeout);

          if (!data || Object.keys(data).length === 0) {
            resolve(null);
            return;
          }

          // Validate user structure
          if (!data.profile) {
            resolve(null);
            return;
          }

          resolve(data);
        });
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }

      // If offline, return null instead of throwing
      if (this.isOffline()) {
        return null;
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to get user',
        details: error,
      } as GunError;
    }
  }

  /**
   * Put user profile data in GunDB
   * Stores or updates user profile information (username, preferences, etc.) in GunDB.
   * Note: This does NOT create the authentication account - use createSEAUser() for that.
   * @param userId - User ID (typically the public key from SEA authentication)
   * @param userData - User profile data to store
   */
  async putUserProfile(userId: string, userData: Partial<User>): Promise<void> {
    try {
      const gun = this.getGun();
      const isOffline = this.isOffline();

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (isOffline) {
            // In offline mode, operation may still succeed in local storage
            // GunDB will sync when connection is restored
            resolve();
            return;
          }
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout creating user',
          } as GunError);
        }, isOffline ? 5000 : 10000);

        const userNode = gun.get(this.getNodePath('user', userId));

        // GunDB works better with flat puts on each nested path
        // rather than one big nested object put
        let pendingPuts = 0;
        let hasError = false;
        let errorDetails: any = null;

        const checkDone = () => {
          pendingPuts--;
          if (pendingPuts <= 0) {
            clearTimeout(timeout);
            if (hasError && !isOffline) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Failed to create user',
                details: errorDetails,
              } as GunError);
            } else {
              resolve();
            }
          }
        };

        const handleAck = (ack: any) => {
          if (ack.err && !hasError) {
            hasError = true;
            errorDetails = ack.err;
            if (isOffline) {
              console.warn('User creation error (offline mode):', ack.err);
            }
          }
          checkDone();
        };

        // Store profile data (flat properties only)
        if (userData.profile) {
          const profile = userData.profile;
          if (profile.username) {
            pendingPuts++;
            userNode.get('profile').get('username').put(profile.username, handleAck);
          }
          if (profile.publicKey) {
            pendingPuts++;
            userNode.get('profile').get('publicKey').put(profile.publicKey, handleAck);
          }
          if (profile.encryptedProfile) {
            pendingPuts++;
            userNode.get('profile').get('encryptedProfile').put(profile.encryptedProfile, handleAck);
          }
        }

        // Store settings if provided (flat properties only)
        if (userData.settings) {
          const settings = userData.settings;
          if (settings.theme) {
            pendingPuts++;
            userNode.get('settings').get('theme').put(settings.theme, handleAck);
          }
          if (settings.openRouterApiKey) {
            pendingPuts++;
            userNode.get('settings').get('openRouterApiKey').put(settings.openRouterApiKey, handleAck);
          }
        }

        // If no properties to store, resolve immediately
        if (pendingPuts === 0) {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }

      // If offline, still resolve - data may be queued locally
      if (this.isOffline()) {
        console.warn('User creation error (offline mode):', error);
        return;
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to create user',
        details: error,
      } as GunError;
    }
  }


  /**
   * Get document by ID
   * @param docId - Document ID
   * @returns Promise resolving to Document or null if not found
   */
  async getDocument(docId: string): Promise<Document | null> {
    try {
      const gun = this.getGun();
      const isOffline = this.isOffline();

      return new Promise<Document | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (isOffline) {
            // In offline mode, return null but don't reject
            // Data might be in local storage but not synced yet
            resolve(null);
            return;
          }
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout waiting for document data',
          } as GunError);
        }, isOffline ? 5000 : 10000);

        gun.get(this.getNodePath('doc', docId)).once((data: Document | null) => {
          clearTimeout(timeout);

          if (!data || Object.keys(data).length === 0) {
            resolve(null);
            return;
          }

          // Validate document structure
          if (!data.metadata || !data.sharing) {
            resolve(null);
            return;
          }

          resolve(data);
        });
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }

      // If offline, return null instead of throwing
      if (this.isOffline()) {
        return null;
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to get document',
        details: error,
      } as GunError;
    }
  }

  /**
   * Create document
   * @param docId - Document ID
   * @param document - Document data
   */
  async createDocument(docId: string, document: Document): Promise<void> {
    try {
      const gun = this.getGun();
      const isOffline = this.isOffline();

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (isOffline) {
            // In offline mode, operation may still succeed in local storage
            resolve();
            return;
          }
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout creating document',
          } as GunError);
        }, isOffline ? 5000 : 10000);

        const docNode = gun.get(this.getNodePath('doc', docId));
        docNode.put(document, (ack: any) => {
          clearTimeout(timeout);

          if (ack.err) {
            // In offline mode, GunDB may still store locally
            if (isOffline) {
              console.warn('Document creation error (offline mode):', ack.err);
              resolve(); // Resolve anyway - data may be in local storage
              return;
            }

            reject({
              code: GunErrorCode.SYNC_ERROR,
              message: 'Failed to create document',
              details: ack.err,
            } as GunError);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }

      // If offline, still resolve - data may be queued locally
      if (this.isOffline()) {
        console.warn('Document creation error (offline mode):', error);
        return;
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to create document',
        details: error,
      } as GunError;
    }
  }

  /**
   * Update document
   * @param docId - Document ID
   * @param updates - Partial document data to update
   */
  async updateDocument(docId: string, updates: Partial<Document>): Promise<void> {
    try {
      const gun = this.getGun();

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout updating document',
          } as GunError);
        }, 10000);

        const docNode = gun.get(this.getNodePath('doc', docId));

        // Merge with existing data
        docNode.once((existing: Document | null) => {
          if (!existing) {
            reject({
              code: GunErrorCode.NOT_FOUND,
              message: 'Document not found',
            } as GunError);
            return;
          }

          const mergedData: Document = {
            ...existing,
            ...updates,
            metadata: {
              ...existing.metadata,
              ...updates.metadata,
            },
            sharing: {
              ...existing.sharing,
              ...updates.sharing,
            },
          };

          docNode.put(mergedData, (ack: any) => {
            clearTimeout(timeout);

            if (ack.err) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Failed to update document',
                details: ack.err,
              } as GunError);
            } else {
              resolve();
            }
          });
        });
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }
      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to update document',
        details: error,
      } as GunError;
    }
  }

  /**
   * Delete document
   * @param docId - Document ID
   */
  async deleteDocument(docId: string): Promise<void> {
    try {
      const gun = this.getGun();

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout deleting document',
          } as GunError);
        }, 10000);

        const docNode = gun.get(this.getNodePath('doc', docId));
        docNode.put(null, (ack: any) => {
          clearTimeout(timeout);

          if (ack.err) {
            reject({
              code: GunErrorCode.SYNC_ERROR,
              message: 'Failed to delete document',
              details: ack.err,
            } as GunError);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }
      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to delete document',
        details: error,
      } as GunError;
    }
  }

  /**
   * List documents for a user
   * @param userId - User ID
   * @returns Promise resolving to array of document IDs
   */
  async listDocuments(userId: string): Promise<string[]> {
    try {
      const gun = this.getGun();

      return new Promise<string[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout listing documents',
          } as GunError);
        }, 10000);

        const userNode = gun.get(this.getNodePath('user', userId));
        const documents: string[] = [];

        userNode.get('documents').map().once((docRef: { docId?: string } | null) => {
          if (docRef && docRef.docId) {
            documents.push(docRef.docId);
          }
        });

        // Wait a bit for all documents to load
        setTimeout(() => {
          clearTimeout(timeout);
          resolve(documents);
        }, 2000);
      });
    } catch (error) {
      if ((error as GunError).code) {
        throw error;
      }
      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to list documents',
        details: error,
      } as GunError;
    }
  }

  /**
   * Subscribe to document changes
   * @param docId - Document ID
   * @param callback - Callback function called on changes
   * @returns Unsubscribe function
   */
  subscribeToDocument(docId: string, callback: DocumentCallback): Unsubscribe {
    try {
      const gun = this.getGun();
      const docNode = gun.get(this.getNodePath('doc', docId));

      const handler = (data: Document | null) => {
        if (!data || Object.keys(data).length === 0) {
          callback(null);
          return;
        }

        // Validate document structure
        if (!data.metadata || !data.sharing) {
          callback(null);
          return;
        }

        callback(data);
      };

      docNode.on(handler);

      // Return unsubscribe function
      return () => {
        docNode.off();
      };
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to subscribe to document',
        details: error,
      };
      throw gunError;
    }
  }

  /**
   * Subscribe to user changes
   * @param userId - User ID
   * @param callback - Callback function called on changes
   * @returns Unsubscribe function
   */
  subscribeToUser(userId: string, callback: UserCallback): Unsubscribe {
    try {
      const gun = this.getGun();
      const userNode = gun.get(this.getNodePath('user', userId));

      const handler = (data: User | null) => {
        if (!data || Object.keys(data).length === 0) {
          callback(null);
          return;
        }

        // Validate user structure
        if (!data.profile) {
          callback(null);
          return;
        }

        callback(data);
      };

      userNode.on(handler);

      // Return unsubscribe function
      return () => {
        userNode.off();
      };
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to subscribe to user',
        details: error,
      };
      throw gunError;
    }
  }

  /**
   * Subscribe to branch changes
   * @param branchId - Branch ID
   * @param callback - Callback function called on changes
   * @returns Unsubscribe function
   */
  subscribeToBranch(branchId: string, callback: BranchCallback): Unsubscribe {
    try {
      const gun = this.getGun();
      const branchNode = gun.get(this.getNodePath('branch', branchId));

      const handler = (data: Branch | null) => {
        if (!data || Object.keys(data).length === 0) {
          callback(null);
          return;
        }

        callback(data);
      };

      branchNode.on(handler);

      // Return unsubscribe function
      return () => {
        branchNode.off();
      };
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to subscribe to branch',
        details: error,
      };
      throw gunError;
    }
  }

  /**
   * Handle offline scenarios
   * GunDB automatically handles offline with IndexedDB, but we can add custom logic
   */
  private handleOffline(): void {
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

      this.gun!.get(this.getNodePath('_retry_test')).put({ timestamp: Date.now() }, (ack: any) => {
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
      });
    });
  }

  /**
   * Get GunDB instance (for advanced usage)
   * @returns GunDB instance or null if not initialized
   */
  getInstance(): GunInstance | null {
    return this.gun;
  }

  /**
   * Create user with SEA
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to SEAUser
   */
  async createSEAUser(username: string, password: string): Promise<SEAUser> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    const gun = this.gun;

    return new Promise<SEAUser>((resolve, reject) => {
      // Create user with SEA
      gun.user().create(username, password, (ack: any) => {
        if (ack.err) {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Failed to create user',
            details: ack.err,
          } as GunError);
          return;
        }

        // Check if user is authenticated by checking gun.user().is
        const user = gun.user();
        const userIs = user.is as any;

        // Get public key from user.is or ack.pub
        const pub = (userIs?.pub as string) || ack.pub || '';

        // If we have a pub key, user was created or exists
        // If ack.ok is 0 and no pub, it's a real failure
        if (!pub) {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message:
              ack.ok === 0
                ? 'User creation failed or user already exists'
                : 'User created but no public key found',
            details: ack,
          } as GunError);
          return;
        }

        // If user.is is not set but we have a pub, authenticate the user
        // This handles the case where user was created but not automatically authenticated
        if (!userIs && pub) {
          // User was created but not authenticated, authenticate now
          gun.user().auth(username, password, (authAck: any) => {
            if (authAck.err) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'User created but authentication failed',
                details: authAck.err,
              } as GunError);
              return;
            }

            // Get authenticated user data
            const authUser = gun.user();
            const authUserIs = authUser.is as any;
            const userData: SEAUser = {
              alias: username,
              pub: (authUserIs?.pub as string) || pub,
            };

            resolve(userData);
          });
          return;
        }

        // User is authenticated, return user data
        const userData: SEAUser = {
          alias: username,
          pub: pub,
        };

        resolve(userData);
      });
    });
  }

  /**
   * Authenticate user with SEA
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to SEAUser
   */
  async authenticateSEAUser(username: string, password: string): Promise<SEAUser> {
    if (!this.gun) {
      throw {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'GunDB not initialized',
      } as GunError;
    }

    return new Promise<SEAUser>((resolve, reject) => {
      // Authenticate user with SEA
      this.gun!.user().auth(username, password, (ack: any) => {
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
        const userIs = user.is as any;

        // If user.is is set with a pub key, authentication succeeded
        if (userIs && userIs.pub) {
          const userData: SEAUser = {
            alias: username,
            pub: userIs.pub as string,
          };

          resolve(userData);
          return;
        }

        // If ack.ok is 1, authentication succeeded but user.is might not be set yet
        // Wait for user state using proper async polling
        if (ack.ok === 1) {
          this.waitForUserState()
            .then(({ pub }) => {
              const userData: SEAUser = {
                alias: username,
                pub: pub,
              };
              resolve(userData);
            })
            .catch((error) => {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Authentication succeeded but user state not set',
                details: error,
              } as GunError);
            });
          return;
        }

        // If ack.ok is 0, check once more with polling
        // This handles the edge case where GunDB returns ok: 0 but auth actually works
        // (which happens on session recall after page refresh)
        if (ack.ok === 0) {
          this.waitForUserState()
            .then(({ pub }) => {
              // Authentication actually succeeded despite ok: 0
              const userData: SEAUser = {
                alias: username,
                pub: pub,
              };
              resolve(userData);
            })
            .catch(() => {
              // Authentication really failed - wrong password
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Invalid username or password',
                details: 'Authentication failed',
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

  /**
   * Wait for user state to be set (for authentication)
   * @returns Promise resolving to user pub key
   */
  private waitForUserState(): Promise<{ pub: string }> {
    return new Promise((resolve, reject) => {
      if (!this.gun) {
        reject(new Error('GunDB not initialized'));
        return;
      }

      const user = this.gun.user();
      const maxAttempts = 20;
      let attempts = 0;

      const checkUserState = () => {
        attempts++;
        const userIs = user.is as any;

        if (userIs && userIs.pub) {
          resolve({ pub: userIs.pub as string });
          return;
        }

        if (attempts >= maxAttempts) {
          reject(new Error('User state not set after authentication'));
          return;
        }

        setTimeout(checkUserState, 100);
      };

      checkUserState();
    });
  }
}

// Export singleton instance
export const gunService = new GunService();

// Export class for testing
export { GunService };
