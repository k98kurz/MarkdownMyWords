/**
 * GunDB Service Browser Tests
 *
 * Tests for GunDB service operations that can be run from the browser console.
 */

import { gunService, GunService } from '@/services/gunService';
import type { GunAck } from '@/types/gun';
import { GunErrorCode } from '@/types/gun';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
} from '@/dev/testRunner';
import { isFailure } from '@/lib/functionalResult';

/**
 * Test GunDB Service initialization
 */

/**
 * Type guard for objects with epub property
 */
function hasEpub(data: unknown): data is { epub: string } {
  return typeof data === 'object' && data !== null && 'epub' in data;
}

/**
 * Test GunDB Service initialization
 */
async function testInitialization(): Promise<TestSuiteResult> {
  console.log('🧪 Testing GunDB Service Initialization...\n');

  const runner = new TestRunner('Initialization');

  await runner.run('Initialize service', async () => {
    gunService.initialize();
    const isReady = gunService.isReady();
    if (!isReady) {
      throw new Error('Service not ready');
    }
  });

  await runner.run('Get GunDB instance', async () => {
    const instance = gunService.getGun();
    if (!instance) {
      throw new Error('Instance is null');
    }
  });

  await runner.run('Re-initialization warning', async () => {
    gunService.initialize();
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
    const createUserResult = await gunService.createUser(
      testUsername,
      testPassword
    );
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await gunService.authenticateUser(
      testUsername,
      testPassword
    );
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await gunService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const usersResult = await gunService.discoverUsers(testUsername);
    if (!usersResult.success) {
      throw usersResult.error;
    }
    const users = usersResult.data;
    if (users.length > 0 && hasEpub(users[0].data)) {
      const epub = users[0].data.epub;
      console.log(`  Ephemeral pubkey retrieved: ${epub.substring(0, 20)}...`);
    } else {
      throw new Error('  Ephemeral pubkey retrieval failed');
    }
    const userState = gunService.getGun()?.user().is;
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
    const gun = gunService.getGun();
    if (gun) {
      gun.user().leave();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const authResult = await gunService.authenticateUser(
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
    const createUserResult = await gunService.createUser(testUser, testPass);
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await gunService.authenticateUser(testUser, testPass);
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await gunService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  await runner.run('Test listItems on public namespace', async () => {
    const gun = gunService.getGun();
    const item1 = gunService.newId();
    const item2 = gunService.newId();
    const item3 = gunService.newId();

    // Write test objects to public test namespace
    await gun.get('test').get('item1').put(item1);
    await gun.get('test').get('item2').put(item2);
    await gun.get('test').get('item3').put(item3);

    // Read
    const itemsResult = await gunService.listItems(['test']);
    if (!itemsResult.success) {
      throw itemsResult.error;
    }
    const items = itemsResult.data;
    if (items.length === 0) {
      throw new Error('No items found in test namespace');
    }
    console.log(
      `  Found ${items.length} items:`,
      `${items.map((i: { soul: string }) => i.soul.substring(0, 10)).join(', ')}`
    );
    console.log(items);

    // Verify structure
    for (const item of items) {
      if (!item.soul || !item.data) {
        console.error(`Malformed item: ${JSON.stringify(item)}`);
        throw new Error('Item missing required properties');
      }
      if (
        typeof item.data === 'string' &&
        ![item1, item2, item3].includes(item.data)
      ) {
        console.error(`Unexpected item.data: ${item.data}`);
      }
    }
  });

  await runner.run('Test listUserItems on user namespace', async () => {
    const gun = gunService.getGun();
    const userItem1 = gunService.newId();
    const userItem2 = gunService.newId();

    // Write test objects to user private namespace
    await new Promise<void>(resolve => {
      gun
        .user()
        .get('private')
        .get('item1')
        .put({ content: userItem1 }, (_ack: GunAck) => {
          // Success - continue
          gun
            .user()
            .get('private')
            .get('item2')
            .put({ content: userItem2 }, (_ack: GunAck) => {
              // Success - continue
              resolve();
            });
        });
    });

    // Read
    await new Promise(resolve => setTimeout(resolve, 500));
    const itemsResult = await gunService.listUserItems(['private']);
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
    const itemsResult = await gunService.listItems(['nonexistent']);
    if (!itemsResult.success) {
      throw itemsResult.error;
    }
    const items = itemsResult.data;
    if (items.length !== 0) {
      throw new Error(`Expected empty array, got ${items.length} items`);
    }
  });

  await runner.task('Cleanup test data', async () => {
    const gun = gunService.getGun();

    // Remove public test items
    await gun.get('test').get('item1').put(null);
    await gun.get('test').get('item2').put(null);
    await gun.get('test').get('item3').put(null);
    // Verify the data is gone
    const itemsResult = await gunService.listItems(['test']);
    if (!itemsResult.success) {
      throw itemsResult.error;
    }
    const items = itemsResult.data;
    if (items.length !== 0) {
      throw new Error(`items not deleted: ${items}`);
    }
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
    const uninitializedService = new GunService();
    const result = await uninitializedService.discoverUsers('test-id');
    if (isFailure(result)) {
      if (result.error.code !== GunErrorCode.INIT_FAILED) {
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
  const gun = gunService.getGun();

  if (!gun) {
    throw new Error(
      'GunDB not initialized - cannot test private data operations'
    );
  }

  const timestamp = Date.now();
  const testUser = `testuser_private_${timestamp}`;
  const testPass = 'testpass123';
  const plainPath = ['secret', 'note'];
  const testData = 'confidential_secret_data_123';

  await runner.task('Private data e2e', async () => {
    const createUserResult = await gunService.createUser(testUser, testPass);
    if (!createUserResult.success) {
      throw createUserResult.error;
    }
    const authResult = await gunService.authenticateUser(testUser, testPass);
    if (!authResult.success) {
      throw authResult.error;
    }
    const writeProfileResult = await gunService.writeProfile();
    if (!writeProfileResult.success) {
      throw writeProfileResult.error;
    }
    const writeResult = await gunService.writePrivateData(plainPath, testData);
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await gunService.readPrivateData(plainPath);
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
    const writeResult = await gunService.writePrivateData(
      nestedPath,
      nestedData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await gunService.readPrivateData(nestedPath);
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
    const writeResult = await gunService.writePrivateData(emptyPath, emptyData);
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await gunService.readPrivateData(emptyPath);
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
    const writeResult = await gunService.writePrivateData(
      specialPath,
      specialData
    );
    if (!writeResult.success) {
      throw writeResult.error;
    }
    const decryptedResult = await gunService.readPrivateData(specialPath);
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

    const firstWriteResult = await gunService.writePrivateData(
      overwritePath,
      originalData
    );
    if (!firstWriteResult.success) {
      throw firstWriteResult.error;
    }
    const firstReadResult = await gunService.readPrivateData(overwritePath);
    if (!firstReadResult.success) {
      throw firstReadResult.error;
    }
    const firstRead = firstReadResult.data;
    if (firstRead !== originalData) {
      throw new Error(`Initial write failed`);
    }

    const secondWriteResult = await gunService.writePrivateData(
      overwritePath,
      newData
    );
    if (!secondWriteResult.success) {
      throw secondWriteResult.error;
    }
    const secondReadResult = await gunService.readPrivateData(overwritePath);
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
    const pathPart1Result = await gunService.getPrivatePathPart('consistent');
    if (!pathPart1Result.success) {
      throw pathPart1Result.error;
    }
    const pathPart2Result = await gunService.getPrivatePathPart('consistent');
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
    const result = await gunService.readPrivateData(nonExistentPath);
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
    gun.user().leave();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  await runner.run('Error when writing without authentication', async () => {
    const testPath = ['noauth', 'test'];
    const testData = 'should_fail';
    const result = await gunService.writePrivateData(testPath, testData);
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
    const state = gunService.getConnectionState();
    console.log(`  Connection state: ${state}`);
  });

  console.log('\n✅ Connection state tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Run all GunDB Service tests
 */
export async function testGunService(): Promise<TestSuiteResult[]> {
  console.log('🚀 Starting GunDB Service Tests\n');
  console.log('='.repeat(60));

  // Check if a user is already logged in and log them out
  const gun = gunService.getGun();
  if (gun) {
    const currentUser = gun.user();
    if (currentUser.is && currentUser.is.pub) {
      console.log(
        `\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`
      );
      gun.user().leave();
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
  console.log('\n' + '='.repeat(60));

  // Final cleanup: Log out any test user
  if (gun) {
    const finalUser = gun.user();
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user');
      gun.user().leave();
      console.log('   ✅ Logged out');
    }
  }

  // Print summary
  printTestSummary(suiteResults);

  return suiteResults;
}
