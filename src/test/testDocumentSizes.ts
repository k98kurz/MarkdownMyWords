/**
 * Test Encryption with Various Document Sizes
 *
 * Tests that AES-256-GCM encryption/decryption works correctly with documents of various sizes.
 */

import { encryptionService } from '../services/encryptionService';

/**
 * Generate test content of specified size
 */
function generateTestContent(sizeInBytes: number): string {
  const char = 'A';
  return char.repeat(sizeInBytes);
}

/**
 * Test encryption/decryption with various document sizes in the browser console
 * @returns Promise that resolves when tests complete
 */
export async function testVariousDocumentSizes(): Promise<void> {
  console.log('🧪 Testing SEA encryption with various document sizes...\n');

  const testSizes = [
    { name: '1 KB', bytes: 1024 },
    { name: '100 KB', bytes: 100 * 1024 },
    { name: '10 MB', bytes: 10 * 1024 * 1024 },
  ];

  for (const testSize of testSizes) {
    console.log(`Testing ${testSize.name} (${testSize.bytes} bytes)...`);

    try {
      const content = generateTestContent(testSize.bytes);
      const docKey = await encryptionService.generateKey();

      const encryptStart = performance.now();
      const encrypted = await encryptionService.encrypt(content, docKey);
      const encryptTime = performance.now() - encryptStart;

      const decryptStart = performance.now();
      const decrypted = await encryptionService.decrypt(encrypted!, docKey);
      const decryptTime = performance.now() - decryptStart;

      const success =
        decrypted === content && decrypted.length === testSize.bytes;

      if (success) {
        const encryptSpeed = Math.round((testSize.bytes * 1000) / encryptTime);
        const decryptSpeed = Math.round((testSize.bytes * 1000) / decryptTime);
        console.log(
          `  ✅ Success - Encrypt: ${Math.round(encryptTime)}ms (${encryptSpeed.toLocaleString()} bytes/s), Decrypt: ${Math.round(decryptTime)}ms (${decryptSpeed.toLocaleString()} bytes/s)`
        );
      } else {
        console.log(`  ❌ Failed - Content mismatch or wrong length`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${errorMessage}`);
    }
  }

  console.log('\n✅ Tests complete!');
}
