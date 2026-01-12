/**
 * Encryption Service
 *
 * Service layer for encryption operations using GunDB's SEA (Security, Encryption, Authorization)
 * as the primary method, with manual AES-256-GCM as a fallback for document-specific keys.
 */

import Gun from 'gun';
import 'gun/sea';
import type { IGunInstance } from 'gun/types';
import { gunService } from './gunService';

/**
 * SEA instance type (from GunDB)
 */
type SEA = typeof Gun.SEA;

/**
 * Encrypted Document (for manual encryption fallback)
 */
export interface EncryptedDocument {
  encryptedContent: string;
  iv: string; // Initialization Vector (base64)
  tag?: string; // Authentication tag (base64, for GCM)
}

/**
 * Encryption Service Error
 */
export interface EncryptionError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * User with SEA authentication
 */
export interface SEAUser {
  alias: string;
  pub: string; // Public key
  epub?: string; // Ephemeral public key
  priv?: string; // Private key (only available after auth)
}

/**
 * Encryption Service Class
 *
 * Provides encryption/decryption using:
 * - Primary: GunDB SEA for automatic encryption
 * - Fallback: Manual AES-256-GCM for document-specific keys
 */
class EncryptionService {
  private sea: SEA | null = null;
  private gun: IGunInstance | null = null;
  private isInitialized = false;
  private currentUser: SEAUser | null = null;

  /**
   * Initialize SEA with GunDB instance
   * Must be called after gunService.initialize()
   */
  async initializeSEA(): Promise<void> {
    if (this.isInitialized) {
      console.warn('SEA already initialized');
      return;
    }

    try {
      // Get GunDB instance from gunService
      const gunInstance = gunService.getInstance();
      if (!gunInstance) {
        throw new Error('GunDB not initialized. Call gunService.initialize() first.');
      }

      this.gun = gunInstance;
      this.sea = Gun.SEA;

      if (!this.sea) {
        throw new Error('SEA not available. Make sure gun/sea is imported.');
      }

      this.isInitialized = true;
      console.log('SEA initialized successfully');
    } catch (error) {
      const encryptionError: EncryptionError = {
        code: 'SEA_INIT_FAILED',
        message: 'Failed to initialize SEA',
        details: error,
      };
      throw encryptionError;
    }
  }

  /**
   * Check if SEA is initialized
   */
  private checkInitialized(): void {
    if (!this.isInitialized || !this.sea || !this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized. Call initializeSEA() first.',
      } as EncryptionError;
    }
  }

  /**
   * Create user with SEA
   * @param username - Username/alias
   * @param password - User password
   * @returns Promise resolving to SEAUser
   */
  async createUser(username: string, password: string): Promise<SEAUser> {
    this.checkInitialized();

    if (!this.gun || !this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    const gun = this.gun;

    return new Promise<SEAUser>((resolve, reject) => {
      // Create user with SEA
      gun.user().create(username, password, (ack: any) => {
        if (ack.err) {
          reject({
            code: 'USER_CREATION_FAILED',
            message: 'Failed to create user',
            details: ack.err,
          } as EncryptionError);
          return;
        }

        if (!ack.ok) {
          reject({
            code: 'USER_CREATION_FAILED',
            message: 'User creation returned not ok',
            details: ack,
          } as EncryptionError);
          return;
        }

        // Get user data
        const user = gun.user();
        const userIs = user.is as any; // GunDB user.is type is complex
        const userData: SEAUser = {
          alias: username,
          pub: (userIs?.pub as string) || '',
        };

        this.currentUser = userData;
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
  async authenticateUser(username: string, password: string): Promise<SEAUser> {
    this.checkInitialized();

    return new Promise<SEAUser>((resolve, reject) => {
      if (!this.gun || !this.sea) {
        reject({
          code: 'SEA_NOT_INITIALIZED',
          message: 'SEA not initialized',
        } as EncryptionError);
        return;
      }

      // Authenticate user with SEA
      this.gun.user().auth(username, password, (ack: any) => {
        if (ack.err) {
          reject({
            code: 'AUTHENTICATION_FAILED',
            message: 'Failed to authenticate user',
            details: ack.err,
          } as EncryptionError);
          return;
        }

        if (!ack.ok) {
          reject({
            code: 'AUTHENTICATION_FAILED',
            message: 'Authentication returned not ok',
            details: ack,
          } as EncryptionError);
          return;
        }

        // Get authenticated user data
        const user = this.gun!.user();
        const userIs = user.is as any; // GunDB user.is type is complex
        const userData: SEAUser = {
          alias: username,
          pub: (userIs?.pub as string) || '',
        };

        this.currentUser = userData;
        resolve(userData);
      });
    });
  }

  /**
   * Get current authenticated user
   * @returns Current SEAUser or null if not authenticated
   */
  getCurrentUser(): SEAUser | null {
    return this.currentUser;
  }

  /**
   * Encrypt data with SEA
   * @param data - Data to encrypt (any serializable type)
   * @param recipientPub - Optional recipient's public key for sharing (uses ECDH)
   * @returns Promise resolving to encrypted string
   */
  async encryptWithSEA(data: any, recipientPub?: string): Promise<string> {
    this.checkInitialized();

    if (!this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      if (recipientPub) {
        // Encrypt for specific recipient using ECDH
        // First, we need an ephemeral key pair for ECDH
        const ephemeralPair = await this.sea.pair();

        // Derive shared secret using ECDH
        const sharedSecret = await this.sea.secret(
          { epub: recipientPub },
          ephemeralPair
        );

        if (!sharedSecret) {
          throw new Error('Failed to derive shared secret');
        }

        // Encrypt using the shared secret as passphrase
        const encrypted = await this.sea.encrypt(data, sharedSecret);
        return encrypted;
      } else {
        // Encrypt for current user (self-encryption)
        // For self-encryption, we can use a passphrase or the user's own key
        // In practice, when storing to user's own data in GunDB, SEA handles this automatically
        // For manual encryption, we'll use a passphrase derived from user's pub
        if (!this.currentUser) {
          throw {
            code: 'NO_USER',
            message: 'No authenticated user. Cannot encrypt without recipient or current user.',
          } as EncryptionError;
        }

        // Use user's public key as a simple passphrase for self-encryption
        // Note: In production, you might want to derive a key from the user's credentials
        const encrypted = await this.sea.encrypt(data, this.currentUser.pub);
        return encrypted;
      }
    } catch (error) {
      throw {
        code: 'ENCRYPTION_FAILED',
        message: 'Failed to encrypt data with SEA',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Decrypt data with SEA
   * @param encrypted - Encrypted string
   * @param senderPub - Optional sender's public key (for ECDH-based decryption)
   * @param ephemeralPair - Optional ephemeral key pair (for ECDH-based decryption)
   * @returns Promise resolving to decrypted data
   */
  async decryptWithSEA(
    encrypted: string,
    senderPub?: string,
    ephemeralPair?: { epriv: string; epub: string }
  ): Promise<any> {
    this.checkInitialized();

    if (!this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      if (senderPub && ephemeralPair) {
        // Decrypt data encrypted with ECDH
        // Derive shared secret using ECDH
        const sharedSecret = await this.sea.secret(
          { epub: senderPub },
          ephemeralPair
        );

        if (!sharedSecret) {
          throw new Error('Failed to derive shared secret');
        }

        // Decrypt using the shared secret as passphrase
        const decrypted = await this.sea.decrypt(encrypted, sharedSecret);
        return decrypted;
      } else {
        // Decrypt data encrypted for current user (self-encryption)
        if (!this.currentUser) {
          throw {
            code: 'NO_USER',
            message: 'No authenticated user. Cannot decrypt without sender info or current user.',
          } as EncryptionError;
        }

        // Use user's public key as passphrase (matches encryption)
        const decrypted = await this.sea.decrypt(encrypted, this.currentUser.pub);
        return decrypted;
      }
    } catch (error) {
      throw {
        code: 'DECRYPTION_FAILED',
        message: 'Failed to decrypt data with SEA',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Convert ArrayBuffer to base64 string (handles large buffers)
   * @param buffer - ArrayBuffer to convert
   * @returns Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
  }

  /**
   * Generate a random document-specific key (256-bit)
   * @returns Promise resolving to CryptoKey
   */
  async generateDocumentKey(): Promise<CryptoKey> {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      return key;
    } catch (error) {
      throw {
        code: 'KEY_GENERATION_FAILED',
        message: 'Failed to generate document key',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Convert CryptoKey to base64 string for storage
   * @param key - CryptoKey to export
   * @returns Promise resolving to base64 string
   */
  async exportKey(key: CryptoKey): Promise<string> {
    try {
      const exported = await crypto.subtle.exportKey('raw', key);
      const keyArray = Array.from(new Uint8Array(exported));
      const keyBase64 = btoa(String.fromCharCode(...keyArray));
      return keyBase64;
    } catch (error) {
      throw {
        code: 'KEY_EXPORT_FAILED',
        message: 'Failed to export key',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Import base64 string to CryptoKey
   * @param keyBase64 - Base64 encoded key
   * @returns Promise resolving to CryptoKey
   */
  async importKey(keyBase64: string): Promise<CryptoKey> {
    try {
      const keyArray = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey(
        'raw',
        keyArray,
        {
          name: 'AES-GCM',
          length: 256,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      return key;
    } catch (error) {
      throw {
        code: 'KEY_IMPORT_FAILED',
        message: 'Failed to import key',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Encrypt document content with manual AES-256-GCM
   * @param content - Plain text content to encrypt
   * @param key - CryptoKey for encryption
   * @returns Promise resolving to EncryptedDocument
   */
  async encryptDocument(content: string, key: CryptoKey): Promise<EncryptedDocument> {
    try {
      // Generate random IV (96 bits for GCM)
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Convert content to ArrayBuffer
      const encoder = new TextEncoder();
      const contentBuffer = encoder.encode(content);

      // Encrypt with AES-256-GCM
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128, // 128-bit authentication tag
        },
        key,
        contentBuffer
      );

      // Extract tag from encrypted data (last 16 bytes)
      const encryptedArray = new Uint8Array(encrypted);
      const tagLength = 16;
      const ciphertextLength = encryptedArray.length - tagLength;
      const ciphertext = encryptedArray.slice(0, ciphertextLength);
      const tag = encryptedArray.slice(ciphertextLength);

      // Convert to base64 for storage (handle large arrays by chunking)
      const encryptedBase64 = this.arrayBufferToBase64(ciphertext.buffer);
      const ivBase64 = this.arrayBufferToBase64(iv.buffer);
      const tagBase64 = this.arrayBufferToBase64(tag.buffer);

      return {
        encryptedContent: encryptedBase64,
        iv: ivBase64,
        tag: tagBase64,
      };
    } catch (error) {
      throw {
        code: 'DOCUMENT_ENCRYPTION_FAILED',
        message: 'Failed to encrypt document',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Decrypt document content with manual AES-256-GCM
   * @param encrypted - EncryptedDocument
   * @param key - CryptoKey for decryption
   * @returns Promise resolving to decrypted string
   */
  async decryptDocument(encrypted: EncryptedDocument, key: CryptoKey): Promise<string> {
    try {
      // Decode base64 strings
      const iv = Uint8Array.from(atob(encrypted.iv), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(encrypted.encryptedContent), (c) => c.charCodeAt(0));
      const tag = encrypted.tag
        ? Uint8Array.from(atob(encrypted.tag), (c) => c.charCodeAt(0))
        : undefined;

      // Combine ciphertext and tag for GCM
      let encryptedBuffer: ArrayBuffer;
      if (tag) {
        // Combine ciphertext + tag
        const combined = new Uint8Array(ciphertext.length + tag.length);
        combined.set(ciphertext);
        combined.set(tag, ciphertext.length);
        encryptedBuffer = combined.buffer;
      } else {
        // If no tag provided, assume it's already combined
        encryptedBuffer = ciphertext.buffer;
      }

      // Decrypt with AES-256-GCM
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128,
        },
        key,
        encryptedBuffer
      );

      // Convert to string
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw {
        code: 'DOCUMENT_DECRYPTION_FAILED',
        message: 'Failed to decrypt document',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Encrypt document key with SEA's ECDH for a specific recipient
   * @param docKey - Document CryptoKey
   * @param recipientPub - Recipient's public key
   * @returns Promise resolving to encrypted key string and ephemeral public key
   */
  async encryptDocumentKeyWithSEA(
    docKey: CryptoKey,
    recipientPub: string
  ): Promise<{ encryptedKey: string; ephemeralPub: string }> {
    this.checkInitialized();

    if (!this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      // Export key to base64
      const keyBase64 = await this.exportKey(docKey);

      // Generate ephemeral key pair for ECDH
      const ephemeralPair = await this.sea.pair();

      // Derive shared secret using ECDH
      const sharedSecret = await this.sea.secret(
        { epub: recipientPub },
        ephemeralPair
      );

      if (!sharedSecret) {
        throw new Error('Failed to derive shared secret');
      }

      // Encrypt key with shared secret
      const encryptedKey = await this.sea.encrypt(keyBase64, sharedSecret);

      return {
        encryptedKey,
        ephemeralPub: ephemeralPair.pub,
      };
    } catch (error) {
      throw {
        code: 'KEY_ENCRYPTION_FAILED',
        message: 'Failed to encrypt document key with SEA',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Decrypt document key with SEA's ECDH
   * @param encryptedKey - Encrypted key string
   * @param senderEpub - Sender's ephemeral public key (from encryptDocumentKeyWithSEA)
   * @returns Promise resolving to CryptoKey
   */
  async decryptDocumentKeyWithSEA(
    encryptedKey: string,
    senderEpub: string
  ): Promise<CryptoKey> {
    this.checkInitialized();

    if (!this.sea || !this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      // Get current user's key pair for ECDH
      const user = this.gun.user();
      if (!user.is) {
        throw {
          code: 'NO_USER',
          message: 'No authenticated user',
        } as EncryptionError;
      }

      // We need the user's ephemeral key pair for ECDH
      // Generate a new ephemeral pair for decryption
      // Note: In production, you might want to store/reuse ephemeral pairs
      const userPair = await this.sea.pair();

      if (!userPair.epriv || !userPair.epub) {
        throw {
          code: 'NO_KEY_PAIR',
          message: 'Failed to generate ephemeral key pair for ECDH',
        } as EncryptionError;
      }

      // Derive shared secret using ECDH
      const sharedSecret = await this.sea.secret({ epub: senderEpub }, userPair);

      if (!sharedSecret) {
        throw new Error('Failed to derive shared secret');
      }

      // Decrypt key with shared secret
      const keyBase64 = await this.sea.decrypt(encryptedKey, sharedSecret);

      // Import key from base64
      const key = await this.importKey(keyBase64);
      return key;
    } catch (error) {
      throw {
        code: 'KEY_DECRYPTION_FAILED',
        message: 'Failed to decrypt document key with SEA',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Get user's public key
   * @param username - Username (optional, defaults to current user)
   * @returns Promise resolving to public key string
   */
  async getUserPublicKey(username?: string): Promise<string> {
    this.checkInitialized();

    if (username && username === this.currentUser?.alias) {
      return this.currentUser.pub;
    }

    // For other users, we'd need to look them up in GunDB
    // This is a simplified version - in practice, you'd query GunDB for the user's pub
    throw {
      code: 'PUBLIC_KEY_NOT_FOUND',
      message: 'Public key lookup not implemented for other users yet',
    } as EncryptionError;
  }

  /**
   * Sign data with SEA
   * @param data - Data to sign
   * @returns Promise resolving to signature string
   */
  async sign(data: any): Promise<string> {
    this.checkInitialized();

    if (!this.sea || !this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      const user = this.gun.user();
      const userIs = user.is as any; // GunDB user.is type is complex
      if (!userIs || !userIs.pub || !userIs.priv) {
        throw {
          code: 'NO_USER',
          message: 'No authenticated user with key pair',
        } as EncryptionError;
      }

      const signature = await this.sea.sign(data, {
        pub: userIs.pub as string,
        priv: userIs.priv as string,
      });
      return signature;
    } catch (error) {
      throw {
        code: 'SIGNING_FAILED',
        message: 'Failed to sign data',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Verify signature with SEA
   * @param signature - Signature string (contains signed data)
   * @param pub - Public key of signer
   * @returns Promise resolving to verified data or null if invalid
   */
  async verify(signature: string, pub: string): Promise<any> {
    this.checkInitialized();

    if (!this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError;
    }

    try {
      // SEA.verify returns the data if valid, or throws/returns undefined if invalid
      const verified = await this.sea.verify(signature, pub);
      return verified;
    } catch (error) {
      // Signature is invalid
      return null;
    }
  }

  /**
   * Store encrypted document key for a collaborator
   * This method encrypts a document key for a collaborator and stores it in the document's sharing configuration
   * @param docId - Document ID
   * @param docKey - Document CryptoKey to encrypt and store
   * @param collaboratorUserId - User ID of the collaborator
   * @param collaboratorPub - Public key of the collaborator
   * @returns Promise resolving to stored encrypted key data (encryptedKey and ephemeralPub)
   */
  async storeEncryptedDocumentKey(
    docId: string,
    docKey: CryptoKey,
    collaboratorUserId: string,
    collaboratorPub: string
  ): Promise<{ encryptedKey: string; ephemeralPub: string }> {
    this.checkInitialized();

    try {
      // Encrypt document key for collaborator using SEA's ECDH
      const { encryptedKey, ephemeralPub } = await this.encryptDocumentKeyWithSEA(
        docKey,
        collaboratorPub
      );

      // Get current document to update sharing configuration
      const document = await gunService.getDocument(docId);
      if (!document) {
        throw {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found',
        } as EncryptionError;
      }

      // Update document sharing configuration with encrypted key
      const updatedSharing = {
        ...document.sharing,
        documentKey: {
          ...document.sharing.documentKey,
          [collaboratorUserId]: JSON.stringify({
            encryptedKey,
            ephemeralPub,
          }),
        },
      };

      // Update document via gunService
      await gunService.updateDocument(docId, {
        sharing: updatedSharing,
      });

      return { encryptedKey, ephemeralPub };
    } catch (error) {
      if ((error as EncryptionError).code) {
        throw error;
      }
      throw {
        code: 'KEY_STORAGE_FAILED',
        message: 'Failed to store encrypted document key',
        details: error,
      } as EncryptionError;
    }
  }

  /**
   * Retrieve and decrypt document key for current user
   * @param docId - Document ID
   * @returns Promise resolving to decrypted CryptoKey
   */
  async retrieveDocumentKey(docId: string): Promise<CryptoKey> {
    this.checkInitialized();

    if (!this.currentUser) {
      throw {
        code: 'NO_USER',
        message: 'No authenticated user',
      } as EncryptionError;
    }

    try {
      // Get document
      const document = await gunService.getDocument(docId);
      if (!document) {
        throw {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found',
        } as EncryptionError;
      }

      // Get encrypted key for current user
      const encryptedKeyData = document.sharing.documentKey?.[this.currentUser.pub];
      if (!encryptedKeyData) {
        throw {
          code: 'KEY_NOT_FOUND',
          message: 'Encrypted document key not found for current user',
        } as EncryptionError;
      }

      // Parse stored key data
      const keyData = JSON.parse(encryptedKeyData);
      const { encryptedKey, ephemeralPub } = keyData;

      // Decrypt document key
      const docKey = await this.decryptDocumentKeyWithSEA(encryptedKey, ephemeralPub);
      return docKey;
    } catch (error) {
      if ((error as EncryptionError).code) {
        throw error;
      }
      throw {
        code: 'KEY_RETRIEVAL_FAILED',
        message: 'Failed to retrieve document key',
        details: error,
      } as EncryptionError;
    }
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

// Export class for testing
export { EncryptionService };
