/**
 * GunDB Service
 *
 * Service layer for GunDB operations including initialization,
 * user management, document CRUD, and real-time subscriptions.
 */

import Gun from 'gun'
import 'gun/sea' // GunDB SEA for encryption
import 'gun/lib/radix' // Radix for storage
import 'gun/lib/radisk' // Radisk for IndexedDB
import { retryWithBackoff } from '../utils/retryHelper'
import type {
  GunInstance,
  Document,
  Branch,
  GunConfig,
  DocumentCallback,
  BranchCallback,
  Unsubscribe,
  GunError,
} from '../types/gun'
import { GunErrorCode, GunNodeRef } from '../types/gun'
import type { IGunUserInstance } from 'gun/types'

export interface SEAUser {
  alias: string
  pub: string // Public key
}

/**
 * GunDB Service Class
 *
 * All GunDB paths are namespaced with the app name to avoid collisions
 * when multiple applications share the same GunDB relay server.
 * Default namespace: 'markdownmywords'
 */
class GunService {
  gun: GunInstance | null = null
  isInitialized = false
  connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected'
  appNamespace: string = 'markdownmywords'

  /**
   * Initialize GunDB client
   * @param relayUrl - Relay server URL (optional, defaults to local relay)
   * @param config - Additional GunDB configuration
   */
  initialize(relayUrl?: string, config?: GunConfig): void {
    if (this.isInitialized) {
      console.warn('GunDB already initialized')
      return
    }

    try {
      // Set app namespace for collision avoidance
      this.appNamespace = config?.appNamespace ?? 'markdownmywords'

      const peers: string[] = []

      if (relayUrl) {
        peers.push(relayUrl)
      } else if (config?.relayUrl) {
        peers.push(config.relayUrl)
      } else if (config?.peers) {
        peers.push(...config.peers)
      }

      // Default to local relay if no peers specified
      if (peers.length === 0) {
        peers.push('http://localhost:8765/gun')
      }

      const gunConfig: {
        peers: string[]
        localStorage?: boolean
        radisk?: boolean
      } = {
        peers,
        localStorage: config?.localStorage ?? true,
        radisk: config?.radisk ?? true, // Enable IndexedDB storage
      }

      this.gun = Gun(gunConfig) as GunInstance

      // Set up connection state monitoring
      this.setupConnectionMonitoring()

      this.isInitialized = true
      console.log('GunDB initialized successfully', { peers, appNamespace: this.appNamespace })
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.CONNECTION_FAILED,
        message: 'Failed to initialize GunDB',
        details: error,
      }
      throw gunError
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
    return `${this.appNamespace}~${parts.join('~')}`
  }

  /**
   * Set up connection state monitoring
   */
  setupConnectionMonitoring(): void {
    if (!this.gun) return

    // Monitor peer connections
    // Note: GunDB doesn't have a built-in connection state API,
    // so we'll track it based on operations
    this.connectionState = 'connecting'

    // Try a test operation to verify connection (using namespaced path)
    this.gun
      .get(this.getNodePath('_connection_test'))
      .put({ timestamp: Date.now() }, (ack: any) => {
        if (ack.err) {
          this.connectionState = 'disconnected'
          console.warn('GunDB connection test failed:', ack.err)
          this.handleOffline()
        } else {
          this.connectionState = 'connected'
          console.log('GunDB connection established')
        }
      })

    // Set up periodic connection health checks
    setInterval(() => {
      if (!this.gun) return

      this.gun.get(this.getNodePath('_health_check')).put({ timestamp: Date.now() }, (ack: any) => {
        if (ack.err && this.connectionState === 'connected') {
          this.connectionState = 'disconnected'
          this.handleOffline()
        } else if (!ack.err && this.connectionState === 'disconnected') {
          this.connectionState = 'connected'
          console.log('GunDB connection restored')
        }
      })
    }, 30000) // Check every 30 seconds
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
      } as GunError
    }
    return this.gun
  }

  /**
   * Get connection state
   */
  getConnectionState(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionState
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.gun !== null
  }

  /**
   * Helper to read a value with one retry (500ms delay)
   * Returns the value or null if not found after retry
   */
  readWithRetry<T>(node: any, callback: (value: T | null) => void, retryDelay = 500): void {
    let retried = false
    const readOnce = () => {
      node.once((value: T | null) => {
        if (value !== null && value !== undefined) {
          callback(value)
        } else if (!retried) {
          retried = true
          setTimeout(readOnce, retryDelay)
        } else {
          callback(null)
        }
      })
    }
    readOnce()
  }

  /**
   * Generate a new UUID.
   * @returns string
   */
  newId(): string {
    return crypto.randomUUID()
  }

  /**
   * Get document by ID
   * @param docId - Document ID
   * @returns Promise resolving to Document or null if not found
   */
  async getDocument(docId: string): Promise<Document | null> {
    try {
      const gun = this.getGun()
      const docNode = gun.get(this.getNodePath('doc', docId))

      return new Promise<Document | null>(resolve => {
        // First check if document exists (with retry)
        this.readWithRetry<string>(docNode.get('metadata').get('title'), title => {
          if (!title) {
            resolve(null)
            return
          }

          // Document exists, read all fields
          const doc: Partial<Document> = {
            metadata: { title: '', createdAt: 0, updatedAt: 0, lastModifiedBy: '' },
          }
          doc.metadata!.title = title
          let pendingReads = 7 // createdAt, updatedAt, lastModifiedBy, encryptedContent, contentIV, owner, isPublic (title already read)

          const checkDone = () => {
            pendingReads--
            if (pendingReads <= 0) {
              if (!doc.sharing)
                doc.sharing = { owner: '', isPublic: false, readAccess: [], writeAccess: [] }
              const reconstructed: Document = {
                metadata: doc.metadata!,
                encryptedContent: doc.encryptedContent || '',
                contentIV: doc.contentIV || '',
                sharing: doc.sharing,
                branches: doc.branches,
              }
              resolve(reconstructed)
            }
          }

          // Read metadata.createdAt
          this.readWithRetry<number>(docNode.get('metadata').get('createdAt'), createdAt => {
            if (createdAt !== null && createdAt !== undefined) {
              if (!doc.metadata)
                doc.metadata = { title: '', createdAt: 0, updatedAt: 0, lastModifiedBy: '' }
              doc.metadata.createdAt = createdAt
            }
            checkDone()
          })

          // Read metadata.updatedAt
          this.readWithRetry<number>(docNode.get('metadata').get('updatedAt'), updatedAt => {
            if (updatedAt !== null && updatedAt !== undefined) {
              if (!doc.metadata)
                doc.metadata = { title: '', createdAt: 0, updatedAt: 0, lastModifiedBy: '' }
              doc.metadata.updatedAt = updatedAt
            }
            checkDone()
          })

          // Read metadata.lastModifiedBy
          this.readWithRetry<string>(
            docNode.get('metadata').get('lastModifiedBy'),
            lastModifiedBy => {
              if (lastModifiedBy) {
                if (!doc.metadata)
                  doc.metadata = { title: '', createdAt: 0, updatedAt: 0, lastModifiedBy: '' }
                doc.metadata.lastModifiedBy = lastModifiedBy
              }
              checkDone()
            }
          )

          // Read encryptedContent
          this.readWithRetry<string>(docNode.get('encryptedContent'), content => {
            if (content) {
              doc.encryptedContent = content
            }
            checkDone()
          })

          // Read contentIV
          this.readWithRetry<string>(docNode.get('contentIV'), iv => {
            if (iv) {
              doc.contentIV = iv
            }
            checkDone()
          })

          // Read sharing.owner
          this.readWithRetry<string>(docNode.get('sharing').get('owner'), owner => {
            if (owner) {
              if (!doc.sharing)
                doc.sharing = { owner: '', isPublic: false, readAccess: [], writeAccess: [] }
              doc.sharing.owner = owner
            }
            checkDone()
          })

          // Read sharing.isPublic
          this.readWithRetry<boolean>(docNode.get('sharing').get('isPublic'), isPublic => {
            if (isPublic !== null && isPublic !== undefined) {
              if (!doc.sharing)
                doc.sharing = { owner: '', isPublic: false, readAccess: [], writeAccess: [] }
              doc.sharing.isPublic = isPublic
            }
            checkDone()
          })
        })
      })
    } catch (error) {
      if ((error as GunError).code) {
        throw error
      }

      if (this.isOffline()) {
        return null
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to get document',
        details: error,
      } as GunError
    }
  }

  /**
   * Create document
   * @param docId - Document ID
   * @param document - Document data
   */
  async createDocument(docId: string, document: Document): Promise<void> {
    try {
      const gun = this.getGun()
      const isOffline = this.isOffline()

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            if (isOffline) {
              // In offline mode, operation may still succeed in local storage
              resolve()
              return
            }
            reject({
              code: GunErrorCode.SYNC_ERROR,
              message: 'Timeout creating document',
            } as GunError)
          },
          isOffline ? 5000 : 10000
        )

        const docNode = gun.get(this.getNodePath('doc', docId))

        // GunDB works better with flat puts on each nested path
        // rather than one big nested object put (especially with arrays)
        let pendingPuts = 0
        let hasError = false
        let errorDetails: any = null

        const checkDone = () => {
          pendingPuts--
          if (pendingPuts <= 0) {
            clearTimeout(timeout)
            if (hasError && !isOffline) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Failed to create document',
                details: errorDetails,
              } as GunError)
            } else {
              resolve()
            }
          }
        }

        const handleAck = (ack: any) => {
          if (ack.err && !hasError) {
            hasError = true
            errorDetails = ack.err
            if (isOffline) {
              console.warn('Document creation error (offline mode):', ack.err)
            }
          }
          checkDone()
        }

        // Store metadata (flat properties)
        if (document.metadata) {
          const metadata = document.metadata
          if (metadata.title) {
            pendingPuts++
            docNode.get('metadata').get('title').put(metadata.title, handleAck)
          }
          if (metadata.createdAt !== undefined) {
            pendingPuts++
            docNode.get('metadata').get('createdAt').put(metadata.createdAt, handleAck)
          }
          if (metadata.updatedAt !== undefined) {
            pendingPuts++
            docNode.get('metadata').get('updatedAt').put(metadata.updatedAt, handleAck)
          }
          if (metadata.lastModifiedBy) {
            pendingPuts++
            docNode.get('metadata').get('lastModifiedBy').put(metadata.lastModifiedBy, handleAck)
          }
          if (metadata.tags && metadata.tags.length > 0) {
            // Store tags array as individual elements (GunDB doesn't accept arrays directly)
            metadata.tags.forEach((tag, index) => {
              pendingPuts++
              docNode.get('metadata').get('tags').get(index.toString()).put(tag, handleAck)
            })
          }
        }

        // Store encrypted content
        if (document.encryptedContent) {
          pendingPuts++
          docNode.get('encryptedContent').put(document.encryptedContent, handleAck)
        }

        // Store content IV
        if (document.contentIV) {
          pendingPuts++
          docNode.get('contentIV').put(document.contentIV, handleAck)
        }

        // Store sharing configuration (flat properties)
        if (document.sharing) {
          const sharing = document.sharing
          if (sharing.owner) {
            pendingPuts++
            docNode.get('sharing').get('owner').put(sharing.owner, handleAck)
          }
          if (sharing.isPublic !== undefined) {
            pendingPuts++
            docNode.get('sharing').get('isPublic').put(sharing.isPublic, handleAck)
          }
          // Store arrays as individual elements (GunDB doesn't accept arrays directly)
          if (sharing.readAccess && sharing.readAccess.length > 0) {
            sharing.readAccess.forEach((userId, index) => {
              pendingPuts++
              docNode.get('sharing').get('readAccess').get(index.toString()).put(userId, handleAck)
            })
          }
          if (sharing.writeAccess && sharing.writeAccess.length > 0) {
            sharing.writeAccess.forEach((userId, index) => {
              pendingPuts++
              docNode.get('sharing').get('writeAccess').get(index.toString()).put(userId, handleAck)
            })
          }
          if (sharing.shareToken) {
            pendingPuts++
            docNode.get('sharing').get('shareToken').put(sharing.shareToken, handleAck)
          }
          if (sharing.documentKey) {
            // Store documentKey object
            pendingPuts++
            docNode.get('sharing').get('documentKey').put(sharing.documentKey, handleAck)
          }
        }

        // Store branches if provided
        if (document.branches) {
          pendingPuts++
          docNode.get('branches').put(document.branches, handleAck)
        }

        // If no properties to store, resolve immediately
        if (pendingPuts === 0) {
          clearTimeout(timeout)
          resolve()
        }
      })
    } catch (error) {
      if ((error as GunError).code) {
        throw error
      }

      // If offline, still resolve - data may be queued locally
      if (this.isOffline()) {
        console.warn('Document creation error (offline mode):', error)
        return
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to create document',
        details: error,
      } as GunError
    }
  }

  /**
   * Update document
   * @param docId - Document ID
   * @param updates - Partial document data to update
   */
  async updateDocument(docId: string, updates: Partial<Document>): Promise<void> {
    try {
      const gun = this.getGun()

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout updating document',
          } as GunError)
        }, 10000)

        const docNode = gun.get(this.getNodePath('doc', docId))

        // Merge with existing data
        docNode.once((existing: Document | null) => {
          if (!existing) {
            reject({
              code: GunErrorCode.NOT_FOUND,
              message: 'Document not found',
            } as GunError)
            return
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
          }

          docNode.put(mergedData, (ack: any) => {
            clearTimeout(timeout)

            if (ack.err) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Failed to update document',
                details: ack.err,
              } as GunError)
            } else {
              resolve()
            }
          })
        })
      })
    } catch (error) {
      if ((error as GunError).code) {
        throw error
      }
      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to update document',
        details: error,
      } as GunError
    }
  }

  /**
   * Delete document
   * @param docId - Document ID
   */
  async deleteDocument(docId: string): Promise<void> {
    try {
      const gun = this.getGun()
      const isOffline = this.isOffline()

      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            if (isOffline) {
              resolve()
              return
            }
            reject({
              code: GunErrorCode.SYNC_ERROR,
              message: 'Timeout deleting document',
            } as GunError)
          },
          isOffline ? 5000 : 10000
        )

        const docNode = gun.get(this.getNodePath('doc', docId))

        // GunDB doesn't allow putting null to root node
        // Delete by setting each property to null
        let pendingDeletes = 0
        let hasError = false
        let errorDetails: any = null

        const checkDone = () => {
          pendingDeletes--
          if (pendingDeletes <= 0) {
            clearTimeout(timeout)
            if (hasError && !isOffline) {
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Failed to delete document',
                details: errorDetails,
              } as GunError)
            } else {
              resolve()
            }
          }
        }

        const handleAck = (ack: any) => {
          if (ack.err && !hasError) {
            hasError = true
            errorDetails = ack.err
            if (isOffline) {
              console.warn('Document deletion error (offline mode):', ack.err)
            }
          }
          checkDone()
        }

        // Delete all document properties
        pendingDeletes++
        docNode.get('metadata').put(null, handleAck)
        pendingDeletes++
        docNode.get('encryptedContent').put(null, handleAck)
        pendingDeletes++
        docNode.get('contentIV').put(null, handleAck)
        pendingDeletes++
        docNode.get('sharing').put(null, handleAck)
        pendingDeletes++
        docNode.get('branches').put(null, handleAck)

        // If no properties to delete, resolve immediately
        if (pendingDeletes === 0) {
          clearTimeout(timeout)
          resolve()
        }
      })
    } catch (error) {
      if ((error as GunError).code) {
        throw error
      }

      // If offline, still resolve - deletion may be queued locally
      if (this.isOffline()) {
        console.warn('Document deletion error (offline mode):', error)
        return
      }

      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to delete document',
        details: error,
      } as GunError
    }
  }

  /**
   * List documents for a user
   * @param userId - User ID
   * @returns Promise resolving to array of document IDs
   */
  async listDocuments(userId: string): Promise<string[]> {
    try {
      const gun = this.getGun()

      return new Promise<string[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject({
            code: GunErrorCode.SYNC_ERROR,
            message: 'Timeout listing documents',
          } as GunError)
        }, 10000)

        const userNode = gun.get(this.getNodePath('user', userId))
        const documents: string[] = []

        userNode
          .get('documents')
          .map()
          .once((docRef: { docId?: string } | null) => {
            if (docRef && docRef.docId) {
              documents.push(docRef.docId)
            }
          })

        // Wait a bit for all documents to load
        setTimeout(() => {
          clearTimeout(timeout)
          resolve(documents)
        }, 2000)
      })
    } catch (error) {
      if ((error as GunError).code) {
        throw error
      }
      throw {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to list documents',
        details: error,
      } as GunError
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
      const gun = this.getGun()
      const docNode = gun.get(this.getNodePath('doc', docId))

      const handler = (data: Document | null) => {
        if (!data || Object.keys(data).length === 0) {
          callback(null)
          return
        }

        // Validate document structure
        if (!data.metadata || !data.sharing) {
          callback(null)
          return
        }

        callback(data)
      }

      docNode.on(handler)

      // Return unsubscribe function
      return () => {
        docNode.off()
      }
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to subscribe to document',
        details: error,
      }
      throw gunError
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
      const gun = this.getGun()
      const branchNode = gun.get(this.getNodePath('branch', branchId))

      const handler = (data: Branch | null) => {
        if (!data || Object.keys(data).length === 0) {
          callback(null)
          return
        }

        callback(data)
      }

      branchNode.on(handler)

      // Return unsubscribe function
      return () => {
        branchNode.off()
      }
    } catch (error) {
      const gunError: GunError = {
        code: GunErrorCode.SYNC_ERROR,
        message: 'Failed to subscribe to branch',
        details: error,
      }
      throw gunError
    }
  }

  /**
   * Handle offline scenarios
   * GunDB automatically handles offline with IndexedDB, but we can add custom logic
   */
  handleOffline(): void {
    if (this.connectionState === 'connected') {
      this.connectionState = 'disconnected'
      console.warn('GunDB went offline - using local storage')
    }
  }

  /**
   * Check if currently offline
   * @returns true if offline, false if online
   */
  isOffline(): boolean {
    return this.connectionState === 'disconnected'
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
      } as GunError
    }

    this.connectionState = 'connecting'

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionState = 'disconnected'
        reject({
          code: GunErrorCode.CONNECTION_FAILED,
          message: 'Connection retry timeout',
        } as GunError)
      }, 10000)

      this.gun!.get(this.getNodePath('_retry_test')).put({ timestamp: Date.now() }, (ack: any) => {
        clearTimeout(timeout)

        if (ack.err) {
          this.connectionState = 'disconnected'
          reject({
            code: GunErrorCode.CONNECTION_FAILED,
            message: 'Failed to reconnect',
            details: ack.err,
          } as GunError)
        } else {
          this.connectionState = 'connected'
          resolve()
        }
      })
    })
  }

  /**
   * Write user profile for discovery by other users
   * Stores the user's epub at their user node
   * Reference: code_references/gundb.md:49-58
   */
  async writeProfile(): Promise<void> {
    const gun = this.getGun()
    return new Promise<void>((resolve, reject) => {
      gun.user().put({ epub: (gun.user().is as any)?.epub }, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Profile storage failed: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
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
      } as GunError
    }

    return new Promise<void>((resolve, reject) => {
      const gun = this.gun!
      gun.user().create(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(`User creation failed: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
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
      } as GunError
    }

    return new Promise<void>((resolve, reject) => {
      const gun = this.gun!
      gun.user().auth(username, password, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Authentication failed: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Discover users who claim a specific username
   * Reference: code_references/gundb.md:76-93
   * @param username - Username to search for
   * @returns Promise resolving to array of discovered user profiles
   */
  async discoverUsers(username: string): Promise<any[]> {
    const gun = this.getGun()
    return new Promise<any[]>(resolve => {
      const collectedProfiles: any[] = []
      setTimeout(() => resolve(collectedProfiles), 500)

      gun
        .get(`~@${username}`)
        .map()
        .once((data: any, pub: string) => {
          if (!data) return
          const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
          gun.get(`~${cleanPub}`).once((userNode: any) => {
            collectedProfiles.push({ pub: cleanPub, data, userNode })
          })
        })
    })
  }

  /**
   * List out all items at a specific node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listItems(
    nodePath: string[], startNode?: GunNodeRef|IGunUserInstance
  ): Promise<any[]> {
    const gun = startNode ?? this.getGun()
    return new Promise<any[]>(resolve => {
      const collectedItems: any[] = []
      setTimeout(() => resolve(collectedItems), 500)

      const node = nodePath.reduce(
        (n: GunNodeRef|IGunUserInterface, part) => n.get(part),
        gun
      )
      node.map()
        .once((data: any, soul: string) => {
          if (!data) return
          const cleanSoul = soul.startsWith('~') ? soul.slice(1) : soul
          gun.get(`~${cleanSoul}`).once((node: any) => {
            collectedItems.push({ soul: cleanSoul, data, node })
          })
        })
    })
  }

  /**
   * List out all items at a specific user node.
   * @param nodePath - the path to the node
   * @returns Promise resolving to array of nodes
   */
  async listUserItems(nodePath: string[]): Promise<any[]> {
    return await this.listItems(nodePath, this.getGun().user())
  }

  /**
   * Hash a path part for private data storage
   * Reference: code_references/gundb.md:103-113
   * @param plainPath - Plain text path part to hash
   * @returns Promise resolving to hashed path string
   */
  async getPrivatePathPart(plainPath: string): Promise<string> {
    const SEA = Gun.SEA
    if (!SEA) {
      throw new Error('SEA not available')
    }
    const gun = this.getGun()
    const user = gun.user()
    const sea = (user as any)._?.sea
    const result = await SEA.work(plainPath, sea)
    if (!result) {
      throw new Error('Failed to hash path part')
    }
    return result
  }

  /**
   * Hash all path parts for private data storage
   * Reference: code_references/gundb.md:115-119
   * @param plainPath - Array of plain text path parts
   * @returns Promise resolving to array of hashed path strings
   */
  async getPrivatePath(plainPath: string[]): Promise<string[]> {
    return await Promise.all(plainPath.map(async (p: string) => await this.getPrivatePathPart(p)))
  }

  /**
   * Write encrypted private data to user storage
   * Reference: code_references/gundb.md:121-145
   * @param plainPath - Array of plain text path parts
   * @param plaintext - Data to encrypt and store
   * @returns Promise resolving to void
   */
  async writePrivateData(plainPath: string[], plaintext: string): Promise<void> {
    const gun = this.getGun()
    const privatePath = await this.getPrivatePath(plainPath)
    const user = gun.user()
    let node: any = user
    for (const part of privatePath) {
      node = node.get(part)
    }

    return new Promise<void>(async (resolve, reject) => {
      const sea = (user as any)._?.sea
      if (!sea) {
        reject(new Error('User cryptographic keypair not available'))
        return
      }

      const SEA = Gun.SEA
      const ciphertext = await SEA?.encrypt(plaintext, sea)
      if (!ciphertext) {
        reject(new Error('SEA.encrypt failed: returned undefined'))
        return
      }

      node.put(ciphertext, (ack: any) => {
        if (ack && ack.err) {
          reject(new Error(`Failed to write private data: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Read and decrypt private data from user storage
   * Reference: code_references/gundb.md:147-165
   * @param plainPath - Array of plain text path parts
   * @param hashedPath - Optional pre-hashed path (for internal use)
   * @returns Promise resolving to decrypted string
   */
  async readPrivateData(plainPath: string[], hashedPath?: string[]): Promise<string> {
    const gun = this.getGun()
    const path = hashedPath || (await this.getPrivatePath(plainPath))
    const user = gun.user()
    let node: any = user
    for (const part of path) {
      node = node.get(part)
    }

    return await new Promise<string>((resolve, reject) => {
      node.once(async (ciphertext: any) => {
        if (ciphertext === undefined) {
          reject(new Error('Private data not found or could not be decrypted'))
        } else {
          const SEA = Gun.SEA
          const sea = (user as any)._?.sea
          const plaintext = await SEA?.decrypt(ciphertext, sea)
          resolve(plaintext)
        }
      })
    })
  }

  /**
   * Read private structured data (like contacts) by iterating keys
   * Reference: code_references/gundb.md:167-215
   * @param plainPath - Array of plain text path parts
   * @param fields - Array of field names to read
   * @returns Promise resolving to array of private data records
   */
  async readPrivateMap(plainPath: string[], fields: string[]): Promise<Record<string, string>[]> {
    const gun = this.getGun()
    const privatePath = await this.getPrivatePath(plainPath)
    const user = gun.user()
    let privateNode: any = user
    for (const part of privatePath) {
      privateNode = privateNode.get(part)
    }

    const keys: string[] = await new Promise<string[]>(resolve => {
      const collectedKeys: string[] = []
      setTimeout(() => resolve(collectedKeys), 500)

      privateNode.map().once((_data: any, key: string) => {
        if (key) {
          collectedKeys.push(key)
        }
      })
    })

    const results: Record<string, string>[] = []
    for (const key of keys) {
      try {
        const record: Record<string, string> = {}
        for (const fieldName of fields) {
          const fieldNameHash = await this.getPrivatePathPart(fieldName)
          const fullHashedPath = [...privatePath, key, fieldNameHash]
          const fieldValue = await this.readPrivateData([], fullHashedPath)
          record[fieldName] = fieldValue
        }
        if (Object.keys(record).length > 0) {
          results.push(record)
        }
      } catch (error: unknown) {
        console.error(
          `Failed to read contact for key ${key}:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    return results
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
      } as GunError
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
          } as GunError)
          return
        }

        // Check if user is already authenticated
        const user = this.gun!.user()

        // If user.is is set with a pub key, authentication succeeded
        // no idea why it needs two different success cases, but it breaks without them both
        if (user.is && user.is.pub) {
          const userData: SEAUser = {
            alias: username,
            pub: user.is.pub as string,
          }
          resolve(userData)
        }

        // If ack.ok !== undefined, login succeeded
        if (ack.ok !== undefined) {
          this.waitForUserState()
            .then(pub => {
              // Authentication actually succeeded despite ok: 0
              const userData: SEAUser = {
                alias: username,
                pub: pub,
              }
              resolve(userData)
            })
            .catch(data => {
              // Authentication really failed - wrong password
              reject({
                code: GunErrorCode.SYNC_ERROR,
                message: 'Invalid username or password',
                details: 'Authentication failed',
                data: data,
              } as GunError)
            })
          return
        }

        // Unexpected response - fail with user-friendly message
        reject({
          code: GunErrorCode.SYNC_ERROR,
          message: 'Invalid username or password',
          details: ack,
        } as GunError)
      })
    })
  }

  async logoutAndWait() {
    const gun = this.getGun()
    gun.user().leave()
    await retryWithBackoff(
      async _ => {
        if (gun.user().is) {
          throw new Error('user is not logging out')
        }
      },
      {
        maxAttempts: 6,
        baseDelay: 100,
        backoffMultiplier: 1.5,
      }
    )
  }

  /**
   * Wait for user state to be set (for authentication)
   * @returns Promise resolving to user pub key
   */
  public async waitForUserState(): Promise<string> {
    const gun = this.getGun()
    await retryWithBackoff(
      async _ => {
        const user = gun.user()
        if (!user.is || !user.is.pub) {
          throw new Error('user is not authenticated')
        }
      },
      {
        maxAttempts: 6,
        baseDelay: 100,
        backoffMultiplier: 1.5,
      }
    )
    const user = gun.user()
    return user.is!.pub as string
  }
}

// Export singleton instance
export const gunService = new GunService()

// Export class for testing
export { GunService }
