import type { GunInstance, SEAInstance } from '@/types/gun';
import { gunService } from '@/services/gunService';
import { getUserSEA, isSEACipher } from '@/misc/seaHelpers';
import type { Result } from '@k98kurz/functional-result';
import { success, tryCatch } from '@k98kurz/functional-result';

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
 * Type guard letting tryCatch error transformers pass through errors that
 * are already EncryptionErrors (e.g. thrown inside the try block).
 */
const isEncryptionError = (error: unknown): error is EncryptionError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  'message' in error;

/**
 * Holster's SafeBuffer caps strings at 1 MiB (MAX_STRING_LENGTH in
 * @mblaney/holster/src/buffer.js). The binding constraint is the DECRYPT
 * side: SafeBuffer.from(ct, "base64") in sea.js rejects ciphertext base64
 * strings over 1 MiB chars = 786,432 ct bytes; minus the 16-byte AES-GCM
 * tag that leaves 786,416 bytes of plaintext. (Encrypt alone would allow
 * ~1 MiB via its binary-string check, but content that cannot be
 * decrypted is useless.) 786,000 leaves a small margin.
 */
const MAX_PLAINTEXT_BYTES = 786_000;

function assertPlaintextSize(content: string): void {
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_PLAINTEXT_BYTES) {
    throw createEncryptionError(
      'ENCRYPTION_FAILED',
      `Content too large: ${byteLength} bytes exceeds the Holster SEA round-trip limit of ${MAX_PLAINTEXT_BYTES} bytes`
    );
  }
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
  public sea: SEAInstance | null = null;
  private gun: GunInstance | null = null;
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
        this.sea = gunInstance.SEA;

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
   * Return the SEA instance, throwing if initializeSEA() has not run.
   * Returning a local (not `this.sea`) keeps non-null narrowing intact
   * inside async closures.
   */
  private requireSEA(): SEAInstance {
    if (!this.isInitialized || !this.sea || !this.gun) {
      throw createEncryptionError(
        'SEA_NOT_INITIALIZED',
        'SEA not initialized. Call initializeSEA() first.'
      );
    }
    return this.sea;
  }

  /**
   * Generate a random symmetric encryption key (256-bit)
   * @returns Promise resolving to string
   */
  async generateKey(): Promise<Result<string, EncryptionError>> {
    const keyResult = await tryCatch<CryptoKey, EncryptionError>(
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
    );
    if (!keyResult.success) {
      return keyResult;
    }
    return this.exportKey(keyResult.data);
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
   * Encrypt content with a symmetric key
   *
   * Holster's SEA requires an `{epriv}` key object (a bare string key makes
   * it return null) and returns a `{ct, iv, s}` cipher object — see
   * docs/memory.md. This method keeps a string-based API: the cipher object
   * is JSON-serialized before being returned.
   *
   * @param content - Plain text content to encrypt
   * @param key - Symmetric key string (e.g. from generateKey())
   * @returns Promise resolving to JSON-serialized cipher string
   */
  async encrypt(
    content: string,
    key: string
  ): Promise<Result<string, EncryptionError>> {
    const sea = this.requireSEA();
    return tryCatch<string, EncryptionError>(
      async () => {
        assertPlaintextSize(content);
        const cipher = await sea.encrypt(content, { epriv: key });
        if (!cipher) {
          throw createEncryptionError(
            'ENCRYPTION_FAILED',
            'SEA.encrypt returned null'
          );
        }
        return JSON.stringify(cipher);
      },
      (error: unknown) =>
        isEncryptionError(error)
          ? error
          : createEncryptionError(
              'ENCRYPTION_FAILED',
              'Failed to encrypt content',
              error
            )
    );
  }

  /**
   * Decrypt content with a symmetric key
   *
   * Expects the JSON-serialized cipher object produced by encrypt().
   * SEA.decrypt returns null for a wrong key or corrupted data — that
   * becomes a failure Result, never a success wrapping null.
   *
   * @param encrypted - JSON-serialized cipher string from encrypt()
   * @param key - Symmetric key string used for encryption
   * @returns Promise resolving to decrypted string
   */
  async decrypt(
    encrypted: string,
    key: string
  ): Promise<Result<string, EncryptionError>> {
    const sea = this.requireSEA();
    return tryCatch<string, EncryptionError>(
      async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(encrypted);
        } catch {
          throw createEncryptionError(
            'DECRYPTION_FAILED',
            'Malformed ciphertext: not valid JSON'
          );
        }
        if (!isSEACipher(parsed)) {
          throw createEncryptionError(
            'DECRYPTION_FAILED',
            'Malformed ciphertext: expected {ct, iv, s} object'
          );
        }

        const decrypted = await sea.decrypt(parsed, { epriv: key });
        if (decrypted === null || decrypted === undefined) {
          throw createEncryptionError(
            'DECRYPTION_FAILED',
            'SEA.decrypt returned null (wrong key or corrupted data)'
          );
        }
        return typeof decrypted === 'string'
          ? decrypted
          : JSON.stringify(decrypted);
      },
      (error: unknown) =>
        isEncryptionError(error)
          ? error
          : createEncryptionError(
              'DECRYPTION_FAILED',
              'Failed to decrypt document',
              error
            )
    );
  }

  /**
   * Encrypt data with SEA's ECDH for a specific recipient
   *
   * `SEA.secret` derives a `{epriv}` shared secret from the authenticated
   * user's pair and the recipient's epub; that secret is passed directly to
   * `SEA.encrypt`, which returns a cipher object. Returns the cipher
   * JSON-serialized so it can be stored as a string.
   *
   * @param data - string plaintext data
   * @param recipientEpub - Recipient's epub
   * @returns Promise resolving to JSON-serialized cipher string
   */
  async encryptECDH(
    data: string,
    recipientEpub: string
  ): Promise<Result<string, EncryptionError>> {
    const sea = this.requireSEA();

    return tryCatch<string, EncryptionError>(
      async () => {
        assertPlaintextSize(data);
        const userNode = this.gun!.user();
        const userPair = getUserSEA(userNode);

        if (!userPair || !userPair.epriv || !userPair.epub) {
          throw createEncryptionError(
            'NO_USER_PAIR',
            'User must be authenticated to encrypt data'
          );
        }

        const sharedSecret = await sea.secret(
          { epub: recipientEpub },
          userPair
        );

        if (!sharedSecret) {
          throw createEncryptionError(
            'ECDH_ENCRYPTION_FAILED',
            'Failed to derive shared secret'
          );
        }

        const encrypted = await sea.encrypt(data, sharedSecret);

        if (!encrypted) {
          throw createEncryptionError(
            'ECDH_ENCRYPTION_FAILED',
            'SEA.encrypt returned null'
          );
        }

        return JSON.stringify(encrypted);
      },
      (error: unknown) =>
        isEncryptionError(error)
          ? error
          : createEncryptionError(
              'ECDH_ENCRYPTION_FAILED',
              'Failed to encrypt data with ECDH',
              error
            )
    );
  }

  /**
   * Decrypt ciphertext with SEA's ECDH
   *
   * Expects the JSON-serialized cipher object produced by encryptECDH().
   *
   * @param encryptedData - JSON-serialized cipher string from encryptECDH()
   * @param senderEpub - Sender's epub
   * @returns Promise resolving to string
   */
  async decryptECDH(
    encryptedData: string,
    senderEpub: string
  ): Promise<Result<string, EncryptionError>> {
    const sea = this.requireSEA();

    return tryCatch<string, EncryptionError>(
      async () => {
        const userNode = this.gun!.user();
        const userPair = getUserSEA(userNode);

        if (!userPair || !userPair.epriv || !userPair.epub) {
          throw createEncryptionError(
            'NO_KEY_PAIR',
            'User must be authenticated to decrypt data'
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(encryptedData);
        } catch {
          throw createEncryptionError(
            'ECDH_DECRYPTION_FAILED',
            'Malformed ciphertext: not valid JSON'
          );
        }
        if (!isSEACipher(parsed)) {
          throw createEncryptionError(
            'ECDH_DECRYPTION_FAILED',
            'Malformed ciphertext: expected {ct, iv, s} object'
          );
        }

        const sharedSecret = await sea.secret(
          { epub: senderEpub },
          userPair
        );

        if (!sharedSecret) {
          throw createEncryptionError(
            'ECDH_DECRYPTION_FAILED',
            'Failed to derive shared secret'
          );
        }

        const decrypted = await sea.decrypt(parsed, sharedSecret);

        if (decrypted === null || decrypted === undefined) {
          throw createEncryptionError(
            'ECDH_DECRYPTION_FAILED',
            'SEA.decrypt returned null (wrong key or corrupted data)'
          );
        }

        return typeof decrypted === 'string'
          ? decrypted
          : JSON.stringify(decrypted);
      },
      (error: unknown) =>
        isEncryptionError(error)
          ? error
          : createEncryptionError(
              'ECDH_DECRYPTION_FAILED',
              'Failed to decrypt ciphertext with ECDH',
              error
            )
    );
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

// Export class for testing
export { EncryptionService };
