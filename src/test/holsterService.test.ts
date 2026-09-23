/**
 * Holster Service Browser Tests
 *
 * Tests for Holster service operations that can be run from the browser console.
 */

import {
  holsterService,
  HolsterService,
  withDeadline,
  type ListItemResult,
} from '@/services/holsterService';
import { HolsterErrorCode, type HolsterError } from '@/types/holster';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
} from '@/dev/testRunner';
import { isFailure } from '@k98kurz/functional-result';
import { retryWithBackoff } from '@/lib/retry';

/**
 * Test Holster Service initialization
 */

/**
 * Test Holster Service initialization
 */
async function testInitialization(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Holster Service Initialization...\n');

  const runner = new TestRunner('Initialization');

  await runner.run('Initialize service', async () => {
    holsterService.initialize();
    const isReady = holsterService.isReady();
    if (!isReady) {
      throw new Error('Service not ready');
    }
  });

  await runner.run('Get Holster instance', async () => {
    const instance = holsterService.getHolster();
    if (!instance) {
      throw new Error('Instance is null');
    }
  });

  await runner.run('Re-initialization warning', async () => {
    holsterService.initialize();
  });

  console.log('\n✅ Initialization tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test user operations
 */
async function testUserOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing User Operations...\n');

  const runner = new TestRunner('User Operations');

  const timestamp = Date.now();
  const testUsername = `testuser_${timestamp}`;
  const testPassword = 'testpassword123';
  let testUserPub: string | null = null;

  await runner.run('Create user', async () => {
    const createUserResult = await holsterService.createUser(
      testUsername,
      testPassword
    );
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await holsterService.authenticateUser(
      testUsername,
      testPassword
    );
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await holsterService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    // Poll discovery until the alias index and user node are readable
    // instead of a blind one-shot read after a fixed sleep (see
    // docs/memory.md).
    try {
      await retryWithBackoff(
        async () => {
          const usersResult = await holsterService.discoverUsers(testUsername);
          if (!usersResult.success) {
            throw usersResult.error;
          }
          const users = usersResult.data;
          if (
            users.length === 0 ||
            typeof users[0].data.epub !== 'string' ||
            users[0].data.epub.length === 0
          ) {
            throw new Error('user profile not discoverable yet');
          }
          console.log(
            `  Encryption pubkey (epub) retrieved: ${users[0].data.epub.substring(0, 20)}...`
          );
        },
        { maxAttempts: 6, baseDelay: 150, backoffMultiplier: 1.5 }
      );
    } catch (error) {
      throw new Error(
        `  Encryption pubkey retrieval failed (discovery did not propagate): ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const userState = holsterService.getHolster()?.user().is;
    if (userState && 'pub' in userState && userState.pub) {
      testUserPub = userState.pub;
    } else {
      throw new Error('Failed to get user pub key');
    }
    console.log(
      `  User created: ${testUsername} (${testUserPub.substring(0, 20)}...)`
    );
  });

  await runner.run('Authenticate user', async () => {
    // Poll until logged out instead of a blind sleep (see docs/memory.md).
    const logoutResult = await holsterService.logoutAndWait();
    if (!logoutResult.success) {
      throw logoutResult.error;
    }
    const authResult = await holsterService.authenticateUser(
      testUsername,
      testPassword
    );
    if (!authResult.success) {
      throw authResult.error;
    }
    console.log(`  User authenticated: ${testUsername}`);
  });

  console.log('\n✅ User operations tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test listItems and listUserItems methods
 */
async function testListItems(): Promise<TestSuiteResult> {
  console.log('🧪 Testing listItems Methods...\n');

  const runner = new TestRunner('ListItems');

  const timestamp = Date.now();
  const testUser = `testuser_list_${timestamp}`;
  const testPass = 'testpass123';

  await runner.task('Create test user and authenticate', async () => {
    const createUserResult = await holsterService.createUser(
      testUser,
      testPass
    );
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await holsterService.authenticateUser(
      testUser,
      testPass
    );
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await holsterService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  await runner.run('Test listItems on public namespace', async () => {
    const holster = holsterService.getHolster();
    const item1 = holsterService.newId();
    const item2 = holsterService.newId();
    const item3 = holsterService.newId();
    const itemIds = [item1, item2, item3];

    // Write test objects to public test namespace, waiting for each put ack
    // (fire-and-forget puts race the read below and yield empty results).
    for (const [index, item] of itemIds.entries()) {
      await new Promise<void>((resolve, reject) => {
        holster
          .get('test')
          .next(`item${index + 1}`)
          .put(item, err => {
            if (err) {
              reject(new Error(`Failed to write item${index + 1}: ${err}`));
            } else {
              resolve();
            }
          });
      });
    }

    // Poll until all items are readable (condition-based, no blind delay)
    let items: ListItemResult[] = [];
    await retryWithBackoff(
      async () => {
        const itemsResult = await holsterService.listItems(['test']);
        if (!itemsResult.success) {
          throw itemsResult.error;
        }
        if (itemsResult.data.length < itemIds.length) {
          throw new Error(
            `expected ${itemIds.length} items, found ${itemsResult.data.length}`
          );
        }
        items = itemsResult.data;
      },
      { maxAttempts: 6, baseDelay: 150, backoffMultiplier: 1.5 }
    );

    console.log(
      `  Found ${items.length} items:`,
      `${items.map(i => i.soul.substring(0, 10)).join(', ')}`
    );
    console.log(items);

    // Verify structure
    for (const item of items) {
      if (!item.soul || !item.data) {
        console.error(`Malformed item: ${JSON.stringify(item)}`);
        throw new Error('Item missing required properties');
      }
      if (typeof item.data === 'string' && !itemIds.includes(item.data)) {
        console.error(`Unexpected item.data: ${item.data}`);
      }
    }
  });

  await runner.run('Test listUserItems on user namespace', async () => {
    const holster = holsterService.getHolster();

    // Holster's user().get() returns undefined when logged out, so the
    // chain below would crash with a cryptic "reading 'next'". Fail with
    // the actual reason instead (usually a failed setup task above).
    if (!holster.user().is?.pub) {
      throw new Error('Not authenticated — user setup task failed earlier');
    }

    const userItem1 = holsterService.newId();
    const userItem2 = holsterService.newId();

    // Write test objects to user private namespace
    await new Promise<void>(resolve => {
      holster
        .user()
        .get('private')
        .next('item1')
        .put({ content: userItem1 }, () => {
          // Success - continue
          holster
            .user()
            .get('private')
            .next('item2')
            .put({ content: userItem2 }, () => {
              // Success - continue
              resolve();
            });
        });
    });

    // Read
    await new Promise(resolve => setTimeout(resolve, 500));
    const itemsResult = await holsterService.listUserItems(['private']);
    if (!itemsResult.success) {
      throw itemsResult.error;
    }
    const items = itemsResult.data;
    if (items.length === 0) {
      throw new Error('No user items found in private namespace');
    }
    console.log(
      `  Found ${items.length} user items: ${items.map((i: { soul: string }) => i.soul.substring(0, 10)).join(', ')}`
    );

    // Verify structure
    for (const item of items) {
      if (!item.soul || !item.data) {
        console.error(`Malformed item: ${JSON.stringify(item)}`);
        throw new Error('User item missing required properties');
      }
      if (
        typeof item.data === 'object' &&
        item.data !== null &&
        'content' in item.data
      ) {
        if (!item.data.content) {
          throw new Error('User item data missing content property');
        }
      } else {
        throw new Error('User item data missing content property');
      }
    }
  });

  await runner.run('Test listItems on non-existent path', async () => {
    const itemsResult = await holsterService.listItems(['nonexistent']);
    if (!itemsResult.success) {
      throw itemsResult.error;
    }
    const items = itemsResult.data;
    if (items.length !== 0) {
      throw new Error(`Expected empty array, got ${items.length} items`);
    }
  });

  await runner.task('Cleanup test data', async () => {
    const holster = holsterService.getHolster();

    // Remove public test items, waiting for each put ack (fire-and-forget
    // puts race the verification read below).
    for (const index of [1, 2, 3]) {
      await new Promise<void>((resolve, reject) => {
        holster
          .get('test')
          .next(`item${index}`)
          .put(null, err => {
            if (err) {
              reject(new Error(`Failed to delete item${index}: ${err}`));
            } else {
              resolve();
            }
          });
      });
    }

    // Poll until the deletions are readable (condition-based, no blind delay)
    await retryWithBackoff(
      async () => {
        const itemsResult = await holsterService.listItems(['test']);
        if (!itemsResult.success) {
          throw itemsResult.error;
        }
        if (itemsResult.data.length !== 0) {
          throw new Error(
            `items not deleted: ${JSON.stringify(itemsResult.data)}`
          );
        }
      },
      { maxAttempts: 6, baseDelay: 150, backoffMultiplier: 1.5 }
    );
  });

  console.log('\n✅ ListItems tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test error handling
 */
async function testErrorHandling(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Error Handling...\n');

  const runner = new TestRunner('Error Handling');
  await runner.run('Operations without initialization', async () => {
    const uninitializedService = new HolsterService();
    const result = await uninitializedService.discoverUsers('test-id');
    if (isFailure(result)) {
      if (result.error.code !== HolsterErrorCode.INIT_FAILED) {
        throw new Error(
          `Expected INIT_FAILED error, got: ${result.error.message}`
        );
      }
    } else {
      throw new Error('Operation should have failed');
    }
  });

  console.log('\n✅ Error handling tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test private data operations (writePrivateData, readPrivateData)
 */
async function testPrivateDataOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Private Data Operations...\n');

  const runner = new TestRunner('Private Data Operations');
  const holster = holsterService.getHolster();

  if (!holster) {
    throw new Error(
      'Holster not initialized - cannot test private data operations'
    );
  }

  const timestamp = Date.now();
  const testUser = `testuser_private_${timestamp}`;
  const testPass = 'testpass123';
  const plainPath = ['secret', 'note'];
  const testData = 'confidential_secret_data_123';

  await runner.task('Private data e2e', async () => {
    const createUserResult = await holsterService.createUser(
      testUser,
      testPass
    );
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await holsterService.authenticateUser(
      testUser,
      testPass
    );
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await holsterService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    const writeResult = await holsterService.writePrivateData(
      plainPath,
      testData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await holsterService.readPrivateData(plainPath);
    if (!decryptedResult.success) {
      throw decryptedResult.error;
    }
    const decrypted = decryptedResult.data;
    if (decrypted !== testData) {
      throw new Error(
        `Data mismatch: expected "${testData}", got "${decrypted}"`
      );
    }
    console.log(`  Data written and read successfully: "${decrypted}"`);
  });

  await runner.run('Write with nested paths', async () => {
    const nestedPath = ['contacts', 'alice', 'username'];
    const nestedData = 'alice_username_test';
    const writeResult = await holsterService.writePrivateData(
      nestedPath,
      nestedData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await holsterService.readPrivateData(nestedPath);
    if (!decryptedResult.success) {
      throw decryptedResult.error;
    }
    const decrypted = decryptedResult.data;
    if (decrypted !== nestedData) {
      throw new Error(
        `Nested data mismatch: expected "${nestedData}", got "${decrypted}"`
      );
    }
    console.log(`  Nested path works correctly: [${nestedPath.join(', ')}]`);
  });

  await runner.run('Write empty string', async () => {
    const emptyPath = ['empty', 'test'];
    const emptyData = '';
    const writeResult = await holsterService.writePrivateData(
      emptyPath,
      emptyData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await holsterService.readPrivateData(emptyPath);
    if (!decryptedResult.success) {
      throw decryptedResult.error;
    }
    const decrypted = decryptedResult.data;
    if (decrypted !== emptyData) {
      throw new Error(
        `Empty string mismatch: expected "${emptyData}", got "${decrypted}"`
      );
    }
    console.log(`  Empty string handled correctly`);
  });

  await runner.run('Write string with special characters', async () => {
    const specialPath = ['special', 'chars'];
    const specialData = 'Hello 世界! 🎉 Special: @#$%^&*()';
    const writeResult = await holsterService.writePrivateData(
      specialPath,
      specialData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await holsterService.readPrivateData(specialPath);
    if (!decryptedResult.success) {
      throw decryptedResult.error;
    }
    const decrypted = decryptedResult.data;
    if (decrypted !== specialData) {
      throw new Error(
        `Special chars mismatch: expected "${specialData}", got "${decrypted}"`
      );
    }
    console.log(`  Special characters handled correctly`);
  });

  await runner.run('Overwrite existing data', async () => {
    const overwritePath = ['overwrite', 'test'];
    const originalData = 'original_data';
    const newData = 'new_data';

    const firstWriteResult = await holsterService.writePrivateData(
      overwritePath,
      originalData
    );
    if (!firstWriteResult.success) {
      throw firstWriteResult.error;
    }
    const firstReadResult = await holsterService.readPrivateData(overwritePath);
    if (!firstReadResult.success) {
      throw firstReadResult.error;
    }
    const firstRead = firstReadResult.data;
    if (firstRead !== originalData) {
      throw new Error(`Initial write failed`);
    }

    const secondWriteResult = await holsterService.writePrivateData(
      overwritePath,
      newData
    );
    if (!secondWriteResult.success) {
      throw secondWriteResult.error;
    }
    const secondReadResult =
      await holsterService.readPrivateData(overwritePath);
    if (!secondReadResult.success) {
      throw secondReadResult.error;
    }
    const secondRead = secondReadResult.data;
    if (secondRead !== newData) {
      throw new Error(
        `Overwrite failed: expected "${newData}", got "${secondRead}"`
      );
    }
    console.log(`  Data overwriting works correctly`);
  });

  await runner.run('Path hashing consistency', async () => {
    const pathPart1Result =
      await holsterService.getPrivatePathPart('consistent');
    if (!pathPart1Result.success) {
      throw pathPart1Result.error;
    }
    const pathPart2Result =
      await holsterService.getPrivatePathPart('consistent');
    if (!pathPart2Result.success) {
      throw pathPart2Result.error;
    }
    const pathPart1 = pathPart1Result.data;
    const pathPart2 = pathPart2Result.data;
    if (pathPart1 !== pathPart2) {
      throw new Error('Path hashing is inconsistent');
    }
    console.log(`  Path hashing is consistent across calls`);
  });

  await runner.run('Error when reading non-existent data', async () => {
    const nonExistentPath = ['nonexistent', 'path', '12345'];
    const result = await holsterService.readPrivateData(nonExistentPath);
    if (isFailure(result)) {
      const errorMsg = result.error.message;
      if (errorMsg.includes('not found') || errorMsg.includes('decrypted')) {
        console.log(`  Correctly returns error for non-existent data`);
      } else {
        throw new Error(`Unexpected error: ${errorMsg}`);
      }
    } else {
      throw new Error('Should have returned error for non-existent data');
    }
  });

  await runner.task('Cleanup test user', async () => {
    holster.user().leave();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  await runner.run('Error when writing without authentication', async () => {
    const testPath = ['noauth', 'test'];
    const testData = 'should_fail';
    const result = await holsterService.writePrivateData(testPath, testData);
    if (isFailure(result)) {
      const errorMsg = result.error.message;
      if (errorMsg.includes('keypair not available')) {
        console.log(`  Correctly returns error without authentication`);
      } else {
        throw new Error(`Unexpected error: ${errorMsg}`);
      }
    } else {
      throw new Error('Should have returned error without authentication');
    }
  });

  console.log('\n✅ Private data operations tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test connection state management
 */
async function testConnectionState(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Connection State Management...\n');

  const runner = new TestRunner('Connection State');

  await runner.run('Get connection state', async () => {
    const state = holsterService.getConnectionState();
    console.log(`  Connection state: ${state}`);
  });

  console.log('\n✅ Connection state tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test withDeadline — the wrapper that bounds every callback-only Holster
 * read/write. Regression guard for the bug class where a read settles only
 * inside a Holster callback that never fires (down relay, wedged storage)
 * and the promise hangs forever.
 */
async function testWithDeadline(): Promise<TestSuiteResult> {
  console.log('🧪 Testing withDeadline...\n');

  const runner = new TestRunner('Deadline');

  await runner.run('Rejects when callback never fires', async () => {
    let detailsEvaluated = false;
    let caught: HolsterError | null = null;
    try {
      await withDeadline<void>(
        () => {
          // Intentionally never settles: simulates a Holster callback that
          // never fires (relay down, nothing cached).
        },
        'Test operation',
        50,
        () => {
          detailsEvaluated = true;
          return { sample: 'detail' };
        }
      );
    } catch (error) {
      caught = error as HolsterError;
    }
    if (caught === null) {
      throw new Error('expected rejection, but operation resolved');
    }
    if (caught.code !== HolsterErrorCode.STORAGE_ERROR) {
      throw new Error(`expected STORAGE_ERROR, got ${String(caught.code)}`);
    }
    if (!caught.message.includes('Test operation timed out after 50ms')) {
      throw new Error(`unexpected message: ${caught.message}`);
    }
    if (!detailsEvaluated) {
      throw new Error('getDetails was not evaluated at timeout time');
    }
  });

  await runner.run('Resolves immediately on callback', async () => {
    const value = await withDeadline<string>(
      resolve => resolve('ok'),
      'Quick op',
      50
    );
    if (value !== 'ok') {
      throw new Error(`expected 'ok', got ${String(value)}`);
    }
  });

  console.log('\n✅ Deadline tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Run all Holster Service tests
 */
export async function testHolsterService(
  suiteNumber?: number
): Promise<TestSuiteResult[]> {
  console.log('🚀 Starting Holster Service Tests\n');
  console.log('='.repeat(60));

  // Check if a user is already logged in and log them out
  const holster = holsterService.getHolster();
  if (holster) {
    const currentUser = holster.user();
    if (currentUser.is && currentUser.is.pub) {
      console.log(
        `\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`
      );
      holster.user().leave();
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('   ✅ Logged out and waited 500ms\n');
    }
  }

  const suiteResults: TestSuiteResult[] = [];

  const initResult = await testInitialization();
  suiteResults.push(initResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const userResult = await testUserOperations();
  suiteResults.push(userResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const listResult = await testListItems();
  suiteResults.push(listResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const privateDataResult = await testPrivateDataOperations();
  suiteResults.push(privateDataResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const errorResult = await testErrorHandling();
  suiteResults.push(errorResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const connResult = await testConnectionState();
  suiteResults.push(connResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const deadlineResult = await testWithDeadline();
  suiteResults.push(deadlineResult);
  console.log('\n' + '='.repeat(60));

  // Final cleanup: Log out any test user
  if (holster) {
    const finalUser = holster.user();
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user');
      holster.user().leave();
      console.log('   ✅ Logged out');
    }
  }

  // Print summary
  printTestSummary(
    suiteResults,
    suiteNumber !== undefined ? `SUITE ${suiteNumber}` : undefined
  );

  return suiteResults;
}
