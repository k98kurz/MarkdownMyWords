/**
 * Test Encryption with Various Document Sizes
 *
 * This script tests encryption/decryption with documents of various sizes
 * to ensure the encryption service handles different content lengths correctly.
 *
 * Usage:
 * 1. Ensure GunDB and SEA are initialized
 * 2. Import and call testVariousDocumentSizes()
 */

import { encryptionService } from '../encryptionService';
import { gunService } from '../gunService';

/**
 * Generate test content of specified size
 */
function generateTestContent(sizeInBytes: number): string {
  const char = 'A';
  return char.repeat(sizeInBytes);
}

/**
 * Test encryption/decryption with various document sizes
 */
export async function testVariousDocumentSizes(): Promise<void> {
  console.log('🧪 Testing encryption with various document sizes...\n');

  // Ensure services are initialized
  if (!gunService.isReady()) {
    gunService.initialize();
  }

  try {
    await encryptionService.initializeSEA();
  } catch (error) {
    console.error('Failed to initialize SEA:', error);
    return;
  }

  // Create a test user for SEA encryption tests
  // Use a unique username to avoid conflicts
  const testUsername = `test_user_${Date.now()}`;
  const testPassword = 'test_password_123';

  try {
    console.log(`Creating test user: ${testUsername}...`);
    await encryptionService.createUser(testUsername, testPassword);
    console.log('✅ Test user created successfully\n');
  } catch (error) {
    // If user already exists, try to authenticate
    try {
      console.log(`User exists, authenticating...`);
      await encryptionService.authenticateUser(testUsername, testPassword);
      console.log('✅ Test user authenticated successfully\n');
    } catch (authError) {
      console.error('Failed to create/authenticate test user:', authError);
      console.log('⚠️  Continuing with tests (some may fail without authenticated user)...\n');
    }
  }

  // Test sizes: 1KB, 10KB, 100KB, 500KB, 1MB
  const testSizes = [
    { name: '1 KB', bytes: 1024 },
    { name: '10 KB', bytes: 10 * 1024 },
    { name: '100 KB', bytes: 100 * 1024 },
    { name: '500 KB', bytes: 500 * 1024 },
    { name: '1 MB', bytes: 1024 * 1024 },
  ];

  const results: Array<{
    size: string;
    originalBytes: number;
    encryptedBytes: number;
    success: boolean;
    encryptTime: number;
    decryptTime: number;
    error?: string;
  }> = [];

  for (const testSize of testSizes) {
    console.log(`Testing ${testSize.name} (${testSize.bytes} bytes)...`);

    try {
      // Generate test content
      const content = generateTestContent(testSize.bytes);

      // Test SEA encryption/decryption
      const encryptStart = performance.now();
      const encrypted = await encryptionService.encryptWithSEA(content);
      const encryptTime = performance.now() - encryptStart;

      const decryptStart = performance.now();
      const decrypted = await encryptionService.decryptWithSEA(encrypted);
      const decryptTime = performance.now() - decryptStart;

      // Verify decryption
      const success = decrypted === content;
      const encryptedSize = new Blob([encrypted]).size;

      results.push({
        size: testSize.name,
        originalBytes: testSize.bytes,
        encryptedBytes: encryptedSize,
        success,
        encryptTime: Math.round(encryptTime),
        decryptTime: Math.round(decryptTime),
      });

      if (success) {
        console.log(`  ✅ Success - Encrypt: ${Math.round(encryptTime)}ms, Decrypt: ${Math.round(decryptTime)}ms`);
      } else {
        console.log(`  ❌ Failed - Content mismatch`);
      }
    } catch (error) {
      // Extract error message from EncryptionError objects or regular errors
      let errorMessage: string;
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String((error as any).message);
        if ((error as any).code) {
          errorMessage = `[${(error as any).code}] ${errorMessage}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }

      console.log(`  ❌ Error: ${errorMessage}`);
      if (error && typeof error === 'object' && 'details' in error) {
        console.log(`     Details:`, (error as any).details);
      }

      results.push({
        size: testSize.name,
        originalBytes: testSize.bytes,
        encryptedBytes: 0,
        success: false,
        encryptTime: 0,
        decryptTime: 0,
        error: errorMessage,
      });
    }
  }

  // Test manual AES-256-GCM encryption with various sizes
  console.log('\n🧪 Testing manual AES-256-GCM encryption with various document sizes...\n');

  for (const testSize of testSizes) {
    console.log(`Testing ${testSize.name} (${testSize.bytes} bytes) with AES-256-GCM...`);

    try {
      // Generate test content
      const content = generateTestContent(testSize.bytes);

      // Generate document key
      const docKey = await encryptionService.generateDocumentKey();

      // Test manual encryption/decryption
      const encryptStart = performance.now();
      const encrypted = await encryptionService.encryptDocument(content, docKey);
      const encryptTime = performance.now() - encryptStart;

      const decryptStart = performance.now();
      const decrypted = await encryptionService.decryptDocument(encrypted, docKey);
      const decryptTime = performance.now() - decryptStart;

      // Verify decryption
      const success = decrypted === content;

      if (success) {
        console.log(`  ✅ Success - Encrypt: ${Math.round(encryptTime)}ms, Decrypt: ${Math.round(decryptTime)}ms`);
      } else {
        console.log(`  ❌ Failed - Content mismatch`);
      }
    } catch (error) {
      // Extract error message from EncryptionError objects or regular errors
      let errorMessage: string;
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String((error as any).message);
        if ((error as any).code) {
          errorMessage = `[${(error as any).code}] ${errorMessage}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = String(error);
      }

      console.log(`  ❌ Error: ${errorMessage}`);
      if (error && typeof error === 'object' && 'details' in error) {
        console.log(`     Details:`, (error as any).details);
      }
    }
  }

  // Print summary
  console.log('\n📊 Summary:');
  console.log('─'.repeat(80));
  console.log(
    'Size'.padEnd(12) +
    'Original'.padEnd(12) +
    'Encrypted'.padEnd(12) +
    'Encrypt(ms)'.padEnd(12) +
    'Decrypt(ms)'.padEnd(12) +
    'Status'
  );
  console.log('─'.repeat(80));

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(
      result.size.padEnd(12) +
      result.originalBytes.toString().padEnd(12) +
      result.encryptedBytes.toString().padEnd(12) +
      result.encryptTime.toString().padEnd(12) +
      result.decryptTime.toString().padEnd(12) +
      status
    );
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log('─'.repeat(80));

  // Check if all tests passed
  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ All tests passed!');
  } else {
    console.log('\n❌ Some tests failed. See details above.');
  }
}

/**
 * Expose test function to window for browser console access
 */
if (typeof window !== 'undefined') {
  // Browser environment - expose to window for console access
  (window as any).testDocumentSizes = testVariousDocumentSizes;
}
