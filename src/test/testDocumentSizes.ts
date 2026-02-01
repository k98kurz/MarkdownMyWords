/**
 * Test Encryption with Various Document Sizes
 *
 * Tests that AES-256-GCM encryption/decryption works correctly with documents of various sizes.
 */

import { encryptionService } from '../services/encryptionService';
import { TestRunner, type TestSuiteResult } from '../utils/testRunner';

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
    { name: '10 MB', bytes: 10 * 1024 * 1024 },
  ];

  for (const testSize of testSizes) {
    await runner.run(`${testSize.name} encryption/decryption`, async () => {
      const content = generateTestContent(testSize.bytes);
      const docKey = await encryptionService.generateKey();

      const encryptStart = performance.now();
      const encrypted = await encryptionService.encrypt(content, docKey);
      const encryptTime = performance.now() - encryptStart;

      const decryptStart = performance.now();
      const decrypted = await encryptionService.decrypt(encrypted!, docKey);
      const decryptTime = performance.now() - decryptStart;

      if (!encrypted || !decrypted) {
        throw new Error('Encryption or decryption returned undefined');
      }

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

  runner.printResults();
  return runner.getResults();
}
