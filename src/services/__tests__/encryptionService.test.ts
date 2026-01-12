/**
 * Encryption Service Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { encryptionService } from '../encryptionService';
import { gunService } from '../gunService';

describe('EncryptionService', () => {
  beforeAll(async () => {
    // Initialize GunDB and SEA before all tests
    try {
      gunService.initialize();
      await encryptionService.initializeSEA();
    } catch (error) {
      console.warn('GunDB initialization failed in test environment:', error);
      // Some tests can still run without GunDB (manual encryption tests)
    }
  });

  describe('Document Encryption (AES-256-GCM)', () => {
    it('should generate document-specific keys', async () => {
      const key = await encryptionService.generateDocumentKey();
      expect(key).toBeInstanceOf(CryptoKey);
    });

    it('should encrypt document with AES-256-GCM', async () => {
      const key = await encryptionService.generateDocumentKey();
      const content = 'test document content';
      const encrypted = await encryptionService.encryptDocument(content, key);
      expect(encrypted.encryptedContent).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.tag).toBeTruthy();
    });

    it('should decrypt document with AES-256-GCM', async () => {
      const key = await encryptionService.generateDocumentKey();
      const content = 'test document content';
      const encrypted = await encryptionService.encryptDocument(content, key);
      const decrypted = await encryptionService.decryptDocument(encrypted, key);
      expect(decrypted).toBe(content);
    });

    it('should encrypt and decrypt different content correctly', async () => {
      const key = await encryptionService.generateDocumentKey();
      const content1 = 'First document';
      const content2 = 'Second document';

      const encrypted1 = await encryptionService.encryptDocument(content1, key);
      const encrypted2 = await encryptionService.encryptDocument(content2, key);

      // Encrypted content should be different
      expect(encrypted1.encryptedContent).not.toBe(encrypted2.encryptedContent);

      // But both should decrypt correctly
      const decrypted1 = await encryptionService.decryptDocument(encrypted1, key);
      const decrypted2 = await encryptionService.decryptDocument(encrypted2, key);

      expect(decrypted1).toBe(content1);
      expect(decrypted2).toBe(content2);
    });
  });

  describe('Key Serialization', () => {
    it('should export key to base64 string', async () => {
      const key = await encryptionService.generateDocumentKey();
      const exported = await encryptionService.exportKey(key);
      expect(exported).toBeTruthy();
      expect(typeof exported).toBe('string');
      // Base64 strings should be non-empty
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should import key from base64 string', async () => {
      const originalKey = await encryptionService.generateDocumentKey();
      const exported = await encryptionService.exportKey(originalKey);
      const importedKey = await encryptionService.importKey(exported);

      expect(importedKey).toBeInstanceOf(CryptoKey);
    });

    it('should round-trip key export/import', async () => {
      const originalKey = await encryptionService.generateDocumentKey();
      const content = 'test content for round-trip';

      // Encrypt with original key
      const encrypted = await encryptionService.encryptDocument(content, originalKey);

      // Export and import key
      const exported = await encryptionService.exportKey(originalKey);
      const importedKey = await encryptionService.importKey(exported);

      // Decrypt with imported key - should work
      const decrypted = await encryptionService.decryptDocument(encrypted, importedKey);
      expect(decrypted).toBe(content);
    });

    it('should throw error when importing invalid key string', async () => {
      await expect(encryptionService.importKey('invalid-base64!!!')).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when decrypting with wrong key', async () => {
      const key1 = await encryptionService.generateDocumentKey();
      const key2 = await encryptionService.generateDocumentKey();
      const content = 'test content';

      const encrypted = await encryptionService.encryptDocument(content, key1);

      // Try to decrypt with wrong key - should fail
      await expect(
        encryptionService.decryptDocument(encrypted, key2)
      ).rejects.toThrow();
    });

    it('should throw error when decrypting corrupted data', async () => {
      const key = await encryptionService.generateDocumentKey();
      const corrupted: any = {
        encryptedContent: 'invalid-base64!!!',
        iv: 'invalid',
        tag: 'invalid',
      };

      await expect(
        encryptionService.decryptDocument(corrupted, key)
      ).rejects.toThrow();
    });

    it('should throw error when encrypting without valid key', async () => {
      // Create a key that's not suitable for encryption
      const invalidKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['decrypt'] // Missing 'encrypt' usage
      );

      await expect(
        encryptionService.encryptDocument('test', invalidKey as CryptoKey)
      ).rejects.toThrow();
    });

    it('should throw error when operations called before initialization', async () => {
      // Create a new service instance that hasn't been initialized
      const { EncryptionService } = await import('../encryptionService');
      const uninitializedService = new EncryptionService();

      const key = await encryptionService.generateDocumentKey();

      // These operations require SEA initialization
      await expect(
        uninitializedService.encryptDocumentKeyWithSEA(key, 'some-pub')
      ).rejects.toThrow();

      await expect(
        uninitializedService.decryptDocumentKeyWithSEA('encrypted', 'epub')
      ).rejects.toThrow();
    });
  });
});
