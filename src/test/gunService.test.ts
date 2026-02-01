/**
 * GunDB Service Browser Tests
 *
 * Tests for GunDB service operations that can be run from the browser console.
 */

import { gunService, GunService } from '../services/gunService';
import type { GunError, GunAck } from '../types/gun';
import { GunErrorCode } from '../types/gun';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
} from '../utils/testRunner';

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
 * Type guard for GunError
 */
function isGunError(error: unknown): error is GunError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
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

  await runner.run('Check connection state', async () => {
    const connectionState = gunService.getConnectionState();
    console.log(`  Connection state: ${connectionState}`);
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
    await gunService.createUser(testUsername, testPassword);
    await gunService.authenticateUser(testUsername, testPassword);
    await gunService.writeProfile();
    await new Promise(resolve => setTimeout(resolve, 500));
    const users = await gunService.discoverUsers(testUsername);
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
    await gunService.authenticateUser(testUsername, testPassword);
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
    await gunService.createUser(testUser, testPass);
    await gunService.authenticateUser(testUser, testPass);
    await gunService.writeProfile();
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
    const items = await gunService.listItems(['test']);
    if (items.length === 0) {
      throw new Error('No items found in test namespace');
    }
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
    const items = await gunService.listUserItems(['private']);
    if (items.length === 0) {
      throw new Error('No user items found in private namespace');
    }
    console.log(
      `  Found ${items.length} user items: ${items.map(i => i.soul.substring(0, 10)).join(', ')}`
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
    const items = await gunService.listItems(['nonexistent']);
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
    const items = await gunService.listItems(['test']).then();
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
    try {
      await uninitializedService.discoverUsers('test-id');
      throw new Error('Operation should have failed');
    } catch (error) {
      if (!isGunError(error)) {
        throw new Error('Error is not a GunError');
      }
      if (error.code !== GunErrorCode.CONNECTION_FAILED) {
        throw new Error(
          `Expected CONNECTION_FAILED error, got: ${error.message}`
        );
      }
    }
  });

  console.log('\n✅ Error handling tests complete!');
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

  await runner.run('Check offline status', async () => {
    const isOffline = gunService.isOffline();
    console.log(`  Is offline: ${isOffline}`);
  });

  await runner.run('Retry connection', async () => {
    await gunService.retryConnection();
    const newState = gunService.getConnectionState();
    console.log(`  Connection retry completed, new state: ${newState}`);
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
