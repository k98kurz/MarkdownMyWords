/**
 * Encryption Service
 *
 * Service layer for document encryption and key sharing.
 *
 * - Document encryption: Manual AES-256-GCM with document-specific symmetric keys
 * - Key sharing: SEA's ECDH for encrypting/decrypting document keys between users
 * - Key serialization: Export/import keys for URL-based sharing
 *
 * NOTE: User authentication (createSEAUser, authenticateUser) is handled by gunService.
 * NOTE: Documents are NOT encrypted with SEA - they use manual AES-256-GCM.
 *       Only document keys are shared via SEA's ECDH.
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
 * Encryption Service Class
 *
 * Provides encryption/decryption using:
 * - Document encryption: Manual AES-256-GCM with per-document symmetric keys
 * - Key sharing: SEA's ECDH for encrypting/decrypting document keys between users
 * - Other: use GunDB/SEA automatic encryption for user data storage
 */
class EncryptionService {
  private sea: SEA | null = null;
  private gun: IGunInstance | null = null;
  private isInitialized = false;

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
   * NOTE: User creation and authentication have been moved to gunService.
   * Use gunService.createSEAUser() and gunService.authenticateSEAUser() instead.
   *
   * NOTE: encryptWithSEA() and decryptWithSEA() have been removed.
   * Documents are encrypted with manual AES-256-GCM, not with SEA.
   * Only document keys are shared via SEA's ECDH (see encryptDocumentKeyWithSEA).
   */

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
   * @param recipientEpub - Recipient's ephemeral public key for ECDHE key exchange
   * @returns Promise resolving to encrypted key string and sender's ephemeral public key
   */
  async encryptDocumentKeyWithSEA(
    docKey: CryptoKey,
    recipientEpub: string
  ): Promise<{ encryptedKey: string; ephemeralPub: string }> {
    this.checkInitialized()

    if (!this.sea) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError
    }

    try {
      // Export key to base64
      const keyBase64 = await this.exportKey(docKey)

      if (!this.gun) {
        throw {
          code: 'SEA_NOT_INITIALIZED',
          message: 'GunDB not initialized',
        } as EncryptionError
      }

      const user = this.gun.user()
      const userIs = user.is

      if (!userIs) {
        throw {
          code: 'NO_USER_PAIR',
          message:
            'No authenticated user. User must be authenticated with SEA.',
        } as EncryptionError
      }

      // Retrieve stored ephemeral keys (generated once per user)
      const userPair = await this.getStoredEphemeralKeys(user);

      if (!userPair || !userPair.epriv || !userPair.epub) {
        throw {
          code: 'NO_USER_PAIR',
          message:
            'Ephemeral keys not available. User must be authenticated and ephemeral keys must be generated.',
        } as EncryptionError
      }

      // Derive shared secret using ECDH
      const sharedSecret = await this.sea.secret({ epub: recipientEpub }, userPair)

      if (!sharedSecret) {
        throw new Error('Failed to derive shared secret')
      }

      // Encrypt key with shared secret
      const encryptedKey = await this.sea.encrypt(keyBase64, sharedSecret)

      // Return encrypted key + sender's ephemeral public key (NOT pub!)
      return {
        encryptedKey,
        ephemeralPub: userPair.epub,
      }
    } catch (error) {
      throw {
        code: 'KEY_ENCRYPTION_FAILED',
        message: 'Failed to encrypt document key with SEA',
        details: error,
      } as EncryptionError
    }
  }

  /**
   * Decrypt document key with SEA's ECDH
   * @param encryptedKey - Encrypted key string
   * @param senderEpub - Sender's ephemeral public key (from encryptDocumentKeyWithSEA)
   * @returns Promise resolving to CryptoKey
   */
  async decryptDocumentKeyWithSEA(encryptedKey: string, senderEpub: string): Promise<CryptoKey> {
    this.checkInitialized()

    if (!this.sea || !this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError
    }

    try {
      // Get current user - must be authenticated
      const user = this.gun.user()
      if (!user.is) {
        throw {
          code: 'NO_USER',
          message: 'No authenticated user',
        } as EncryptionError
      }

      // Retrieve stored ephemeral keys (generated once per user)
      const userPair = await this.getStoredEphemeralKeys(user);

      if (!userPair || !userPair.epriv || !userPair.epub) {
        throw {
          code: 'NO_KEY_PAIR',
          message:
            'Ephemeral keys not available. User must be authenticated and ephemeral keys must be generated.',
        } as EncryptionError
      }

      // Derive shared secret using ECDH
      // senderEpub is the ephemeral public key from the sender
      // userPair is the recipient's persistent key pair
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
   * Retrieve stored ephemeral keys for the authenticated user
   * These keys are generated once per user and stored in GunDB
   */
  private async getStoredEphemeralKeys(user: any): Promise<{ epriv: string; epub: string } | null> {
    const userPub = (user.is)?.pub;
    if (!userPub || !this.gun) {
      return null;
    }

    // Get epub from app namespace path (publicly accessible)
    const epub = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 200);
      const userNode = this.gun!.get(`markdownmywords~user~${userPub}`);
      userNode.get('ephemeralPub').once((value: any) => {
        clearTimeout(timeout);
        resolve(value || null);
      });
    });

    if (!epub) {
      return null;
    }

    // Get epriv from user's encrypted storage (stored via user.get())
    const epriv = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 200);
      user.get('ephemeralKeys').get('epriv').once((value: any) => {
        clearTimeout(timeout);
        resolve(value || null);
      });
    });

    if (!epriv) {
      return null;
    }

    return { epriv, epub };
  }

  /**
   * Get current user's public key from GunDB
   * @returns Promise resolving to public key string
   */
  async getCurrentUserPublicKey(): Promise<string> {
    this.checkInitialized();

    if (!this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'GunDB not initialized',
      } as EncryptionError;
    }

    const user = this.gun.user();
    const userIs = user.is;

    if (!userIs || !userIs.pub) {
      throw {
        code: 'NO_USER',
        message: 'No authenticated user',
      } as EncryptionError;
    }

    return userIs.pub as string;
  }

  /**
   * Retrieve and decrypt document key for current user
   * @param docId - Document ID
   * @returns Promise resolving to decrypted CryptoKey
   */
  async retrieveDocumentKey(docId: string): Promise<CryptoKey> {
    this.checkInitialized();

    try {
      // Get current user's public key
      const userPub = await this.getCurrentUserPublicKey();

      // Get document
      const document = await gunService.getDocument(docId);
      if (!document) {
        throw {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found',
        } as EncryptionError;
      }

      // Get encrypted key for current user
      const encryptedKeyData = document.sharing.documentKey?.[userPub];
      if (!encryptedKeyData) {
        throw {
          code: 'KEY_NOT_FOUND',
          message: 'Encrypted document key not found for current user',
        } as EncryptionError;
      }

      // Parse stored key data with validation
      let keyData: { encryptedKey: string; ephemeralPub: string }
      try {
        keyData = JSON.parse(encryptedKeyData)
        if (!keyData || typeof keyData !== 'object') {
          throw new Error('Invalid key data structure: not an object')
        }
        if (!keyData.encryptedKey || typeof keyData.encryptedKey !== 'string') {
          throw new Error('Invalid key data structure: missing or invalid encryptedKey')
        }
        if (!keyData.ephemeralPub || typeof keyData.ephemeralPub !== 'string') {
          throw new Error('Invalid key data structure: missing or invalid ephemeralPub')
        }
      } catch (error) {
        throw {
          code: 'KEY_DATA_INVALID',
          message: 'Failed to parse encrypted key data',
          details: error instanceof Error ? error.message : String(error),
        } as EncryptionError
      }
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
