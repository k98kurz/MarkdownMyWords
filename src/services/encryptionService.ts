import Gun from 'gun';
import 'gun/sea';
import type { IGunInstance } from 'gun/types';
import { gunService } from './gunService';
import { getUserSEA } from '../utils/seaHelpers';
import {
  Result,
  success,
  failure,
  tryCatch,
  pipe,
  chain,
} from '../utils/functionalResult';

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

function createEncryptionError(
  code: string,
  message: string,
  details?: unknown
): EncryptionError {
  return {
    code,
    message,
    details,
  };
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
  public sea: SEA | null = null;
  private gun: IGunInstance | null = null;
  private isInitialized = false;

  /**
   * Initialize SEA with GunDB instance
   * Must be called after gunService.initialize()
   */
  async initializeSEA(): Promise<Result<void, EncryptionError>> {
    if (this.isInitialized) {
      console.warn('SEA already initialized');
      return success(undefined);
    }

    const result: Result<void, EncryptionError> = await tryCatch<
      void,
      EncryptionError
    >(
      async (): Promise<void> => {
        const gunInstance = gunService.getGun();
        if (!gunInstance) {
          throw new Error(
            'GunDB not initialized. Call gunService.initialize() first.'
          );
        }

        this.gun = gunInstance;
        this.sea = Gun.SEA;

        if (!this.sea) {
          throw new Error('SEA not available. Make sure gun/sea is imported.');
        }

        this.isInitialized = true;
        console.log('SEA initialized successfully');
      },
      (error: unknown) =>
        createEncryptionError(
          'SEA_INIT_FAILED',
          'Failed to initialize SEA',
          error
        )
    );
    return result;
  }

  /**
   * Check if SEA is initialized
   */
  private checkInitialized(): void {
    if (!this.isInitialized || !this.sea || !this.gun) {
      throw createEncryptionError(
        'SEA_NOT_INITIALIZED',
        'SEA not initialized. Call initializeSEA() first.'
      );
    }
  }

  /**
   * Generate a random symmetric encryption key (256-bit)
   * @returns Promise resolving to string
   */
  async generateKey(): Promise<Result<string, EncryptionError>> {
    return pipe(
      await tryCatch<CryptoKey, EncryptionError>(
        () =>
          crypto.subtle.generateKey(
            {
              name: 'AES-GCM',
              length: 256,
            },
            true,
            ['encrypt', 'decrypt']
          ),
        (error: unknown) =>
          createEncryptionError(
            'KEY_GENERATION_FAILED',
            'Failed to generate encryption key',
            error
          )
      ),
      result => {
        if (!result.success) {
          return result;
        }
        return this.exportKey(result.data);
      }
    );
  }

  /**
   * Convert CryptoKey to base64 string for storage
   * @param key - CryptoKey to export
   * @returns Promise resolving to base64 string
   */
  async exportKey(key: CryptoKey): Promise<Result<string, EncryptionError>> {
    return tryCatch<string, EncryptionError>(
      async () => {
        const exported = await crypto.subtle.exportKey('raw', key);
        const keyArray = Array.from(new Uint8Array(exported));
        const keyBase64 = btoa(String.fromCharCode(...keyArray));
        return keyBase64;
      },
      (error: unknown) =>
        createEncryptionError(
          'KEY_EXPORT_FAILED',
          'Failed to export key',
          error
        )
    );
  }

  /**
   * Encrypt content
   * @param content - Plain text content to encrypt
   * @param key - string for encryption
   * @returns Promise resolving to string
   */
  async encrypt(
    content: string,
    key: string
  ): Promise<Result<string, EncryptionError>> {
    return pipe(
      tryCatch<string | undefined, EncryptionError>(
        async () => await this.sea?.encrypt(content, key),
        (error: unknown) =>
          createEncryptionError(
            'ENCRYPTION_FAILED',
            'Failed to encrypt content',
            error
          )
      ),
      chain(encrypted =>
        encrypted === undefined
          ? failure(
              createEncryptionError(
                'ENCRYPTION_FAILED',
                'SEA.encrypt returned undefined'
              )
            )
          : success(encrypted)
      )
    );
  }

  /**
   * Decrypt content
   * @param encrypted - string
   * @param key - string for decryption
   * @returns Promise resolving to decrypted string
   */
  async decrypt(
    encrypted: string,
    key: string
  ): Promise<Result<string, EncryptionError>> {
    return pipe(
      tryCatch<string | undefined, EncryptionError>(
        async () => await this.sea?.decrypt(encrypted, key),
        (error: unknown) =>
          createEncryptionError(
            'DECRYPTION_FAILED',
            'Failed to decrypt document',
            error
          )
      ),
      chain(decrypted =>
        decrypted === undefined
          ? failure(
              createEncryptionError(
                'DECRYPTION_FAILED',
                'SEA.decrypt returned undefined'
              )
            )
          : success(decrypted)
      )
    );
  }

  /**
   * Encrypt data with SEA's ECDH for a specific recipient
   * @param data - string plaintext data
   * @param recipientEpub - Recipient's epub
   * @param senderPair - Sender's ECDH key pair
   * @returns Promise resolving to encrypted key string
   */
  async encryptECDH(
    data: string,
    recipientEpub: string
  ): Promise<Result<string, EncryptionError>> {
    this.checkInitialized();

    return pipe(
      tryCatch<string, EncryptionError>(
        async () => {
          if (!this.sea) {
            throw createEncryptionError(
              'SEA_NOT_INITIALIZED',
              'SEA not initialized'
            );
          }

          const userNode = this.gun!.user();
          const userPair = getUserSEA(userNode);

          if (!userPair || !userPair.epriv || !userPair.epub) {
            throw createEncryptionError(
              'NO_USER_PAIR',
              'User must be authenticated to encrypt data'
            );
          }

          const sharedSecret = await this.sea.secret(
            { epub: recipientEpub },
            userPair
          );

          if (!sharedSecret) {
            throw createEncryptionError(
              'ECDH_ENCRYPTION_FAILED',
              'Failed to derive shared secret'
            );
          }

          const encrypted = await this.sea!.encrypt(data, sharedSecret);

          if (encrypted === undefined) {
            throw createEncryptionError(
              'ECDH_ENCRYPTION_FAILED',
              'SEA.encrypt returned undefined'
            );
          }

          return encrypted;
        },
        (error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'message' in error
          ) {
            return error as EncryptionError;
          }
          return createEncryptionError(
            'ECDH_ENCRYPTION_FAILED',
            'Failed to encrypt data with ECDH',
            error
          );
        }
      )
    );
  }

  /**
   * Decrypt ciphertext with SEA's ECDH
   * @param encryptedData - Encrypted data string
   * @param senderEpub - Sender's epub
   * @returns Promise resolving to string
   */
  async decryptECDH(
    encryptedData: string,
    senderEpub: string
  ): Promise<Result<string, EncryptionError>> {
    this.checkInitialized();

    return pipe(
      tryCatch<string, EncryptionError>(
        async () => {
          if (!this.sea || !this.gun) {
            throw createEncryptionError(
              'SEA_NOT_INITIALIZED',
              'SEA not initialized'
            );
          }

          const userNode = this.gun!.user();
          const userPair = getUserSEA(userNode);

          if (!userPair || !userPair.epriv || !userPair.epub) {
            throw createEncryptionError(
              'NO_KEY_PAIR',
              'User must be authenticated to decrypt data'
            );
          }

          const sharedSecret = await this.sea.secret(
            { epub: senderEpub },
            userPair
          );

          if (!sharedSecret) {
            throw createEncryptionError(
              'ECDH_DECRYPTION_FAILED',
              'Failed to derive shared secret'
            );
          }

          const decrypted = await this.sea!.decrypt(
            encryptedData,
            sharedSecret
          );

          if (decrypted === undefined) {
            throw createEncryptionError(
              'ECDH_DECRYPTION_FAILED',
              'SEA.decrypt returned undefined'
            );
          }

          return decrypted;
        },
        (error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            'message' in error
          ) {
            return error as EncryptionError;
          }
          return createEncryptionError(
            'ECDH_DECRYPTION_FAILED',
            'Failed to decrypt ciphertext with ECDH',
            error
          );
        }
      )
    );
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

// Export class for testing
export { EncryptionService };
