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
   * Generate a random document-specific key (256-bit)
   * @returns Promise resolving to string
   */
  async generateDocumentKey(): Promise<string> {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      return this.exportKey(key);
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
   * Encrypt document content with manual AES-256-GCM
   * @param content - Plain text content to encrypt
   * @param key - string for encryption
   * @returns Promise resolving to EncryptedDocument
   */
  async encryptDocument(content: string, key: string): Promise<string|undefined> {
    try {
      return await this.sea?.encrypt(content, key)
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
   * @param key - string for decryption
   * @returns Promise resolving to decrypted string
   */
  async decryptDocument(encrypted: string, key: string): Promise<string|undefined> {
    try {
       return this.sea?.decrypt(encrypted, key)
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
   * @param docKey - Document string
   * @param recipientEpub - Recipient's ephemeral public key for ECDHE key exchange
   * @returns Promise resolving to encrypted key string and sender's ephemeral public key
   */
  async encryptDocumentKeyWithSEA(
    docKey: string,
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
      if (!this.gun) {
        throw {
          code: 'SEA_NOT_INITIALIZED',
          message: 'GunDB not initialized',
        } as EncryptionError
      }

      const userPair = await this.getStoredEphemeralKeys();

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
      const encryptedKey = await this.sea.encrypt(docKey, sharedSecret)

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
   * @returns Promise resolving to string
   */
  async decryptDocumentKeyWithSEA(encryptedKey: string, senderEpub: string): Promise<string|undefined> {
    this.checkInitialized()

    if (!this.sea || !this.gun) {
      throw {
        code: 'SEA_NOT_INITIALIZED',
        message: 'SEA not initialized',
      } as EncryptionError
    }

    try {
      // Retrieve stored ephemeral keys (generated once per user)
      const userPair = await this.getStoredEphemeralKeys();

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
      return await this.sea.decrypt(encryptedKey, sharedSecret);
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
  private async getStoredEphemeralKeys(): Promise<{ epriv: string; epub: string } | null> {
    const user = this.gun!.user()
    const userPub = user.is?.pub;
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
   * Retrieve and decrypt document key for current user
   * @param docId - Document ID
   * @returns Promise resolving to decrypted string
   */
  async retrieveDocumentKey(docId: string): Promise<string|undefined> {
    this.checkInitialized();

    try {
      // Get current user's public key
      const userPub = await this.gun!.user().is!.pub;

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
