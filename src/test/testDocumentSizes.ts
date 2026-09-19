/**
 * Test Encryption with Various Document Sizes
 *
 * Tests that AES-256-GCM encryption/decryption works correctly with documents of various sizes.
 */

import { encryptionService } from '@/services/encryptionService';
import { TestRunner, type TestSuiteResult } from '@/dev/testRunner';

/**
 * Generate test content of specified size
 */
function generateTestContent(sizeInBytes: number): string {
  const char = 'A';
  return char.repeat(sizeInBytes);
}

/**
 * Test encryption/decryption with various document sizes in browser console
 * @returns Promise that resolves when tests complete
 */
export async function testVariousDocumentSizes(): Promise<TestSuiteResult> {
  console.log('🧪 Testing SEA encryption with various document sizes...\n');

  const runner = new TestRunner('Document Encryption Sizes');

  const testSizes = [
    { name: '1 KB', bytes: 1024 },
    { name: '100 KB', bytes: 100 * 1024 },
    // Boundary: MAX_PLAINTEXT_BYTES is set by SEA.decrypt's base64-string
    // check (1 MiB base64 => ~786 KB plaintext max) — see encryptionService.
    { name: '786 KB (max)', bytes: 786_000 },
  ];

  for (const testSize of testSizes) {
    await runner.run(`${testSize.name} encryption/decryption`, async () => {
      const content = generateTestContent(testSize.bytes);
      const keyResult = await encryptionService.generateKey();
      if (!keyResult.success) {
        throw new Error(
          `key generation failed: ${JSON.stringify(keyResult.error)}`
        );
      }
      const docKey = keyResult.data;

      const encryptStart = performance.now();
      const encryptedResult = await encryptionService.encrypt(content, docKey);
      if (!encryptedResult.success) {
        throw new Error(
          `encryption failed: ${JSON.stringify(encryptedResult.error)}`
        );
      }
      const encrypted = encryptedResult.data;
      const encryptTime = performance.now() - encryptStart;

      const decryptStart = performance.now();
      const decryptedResult = await encryptionService.decrypt(
        encrypted,
        docKey
      );
      if (!decryptedResult.success) {
        throw new Error(
          `decryption failed: ${JSON.stringify(decryptedResult.error)}`
        );
      }
      const decrypted = decryptedResult.data;
      const decryptTime = performance.now() - decryptStart;

      if (decrypted !== content || decrypted.length !== testSize.bytes) {
        throw new Error('Content mismatch or wrong length');
      }

      const encryptSpeed = Math.round((testSize.bytes * 1000) / encryptTime);
      const decryptSpeed = Math.round((testSize.bytes * 1000) / decryptTime);
      console.log(
        `  ✅ ${testSize.name} - Encrypt: ${Math.round(encryptTime)}ms (${encryptSpeed.toLocaleString()} bytes/s), Decrypt: ${Math.round(decryptTime)}ms (${decryptSpeed.toLocaleString()} bytes/s)`
      );
    });
  }

  await runner.run('oversized content fails with clear error', async () => {
    const oversized = 'A'.repeat(800_000);
    const keyResult = await encryptionService.generateKey();
    if (!keyResult.success) {
      throw new Error(
        `key generation failed: ${JSON.stringify(keyResult.error)}`
      );
    }
    const encryptResult = await encryptionService.encrypt(
      oversized,
      keyResult.data
    );
    if (encryptResult.success) {
      throw new Error('oversized content should fail encryption');
    }
    if (
      encryptResult.error.code !== 'ENCRYPTION_FAILED' ||
      !encryptResult.error.message.includes('too large')
    ) {
      throw new Error(
        `expected clear size-limit error, got: ${JSON.stringify(encryptResult.error)}`
      );
    }
    console.log(`  ✅ rejected as expected: ${encryptResult.error.message}`);
  });

  runner.printResults();
  return runner.getResults();
}
