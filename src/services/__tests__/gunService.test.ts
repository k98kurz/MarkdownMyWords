/**
 * GunDB Service Browser Tests
 *
 * Tests for GunDB service operations that can be run from the browser console.
 */

import { gunService, GunService } from '../gunService';
import type { User, Document, GunError } from '../../types/gun';
import { GunErrorCode } from '../../types/gun';

/**
 * Test result tracking
 */
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface TestSuiteResult {
  suiteName: string;
  tests: TestResult[];
  passed: number;
  failed: number;
}

/**
 * Test GunDB Service initialization
 */
async function testInitialization(): Promise<TestSuiteResult> {
  console.log('🧪 Testing GunDB Service Initialization...\n');

  const results: TestResult[] = [];

  try {
    // Test 1: Initialize service
    console.log('Test 1: Initialize service');
    gunService.initialize();
    const isReady = gunService.isReady();
    if (isReady) {
      console.log('  ✅ Service initialized successfully');
      results.push({ name: 'Initialize service', passed: true });
    } else {
      console.log('  ❌ Service initialization failed');
      results.push({ name: 'Initialize service', passed: false, error: 'Service not ready' });
      return { suiteName: 'Initialization', tests: results, passed: 0, failed: results.length };
    }

    // Test 2: Check connection state
    console.log('Test 2: Check connection state');
    const connectionState = gunService.getConnectionState();
    console.log(`  ✅ Connection state: ${connectionState}`);
    results.push({ name: 'Check connection state', passed: true });

    // Test 3: Get instance
    console.log('Test 3: Get GunDB instance');
    const instance = gunService.getInstance();
    if (instance) {
      console.log('  ✅ Instance retrieved successfully');
      results.push({ name: 'Get GunDB instance', passed: true });
    } else {
      console.log('  ❌ Instance is null');
      results.push({ name: 'Get GunDB instance', passed: false, error: 'Instance is null' });
    }

    // Test 4: Re-initialization warning
    console.log('Test 4: Re-initialization (should warn)');
    gunService.initialize();
    console.log('  ✅ Re-initialization handled (check console for warning)');
    results.push({ name: 'Re-initialization warning', passed: true });

    console.log('\n✅ Initialization tests complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'Initialization suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'Initialization', tests: results, passed, failed };
}

/**
 * Test user operations
 */
async function testUserOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing User Operations...\n');

  const results: TestResult[] = [];

  try {
    const timestamp = Date.now();
    const testUsername = `testuser_${timestamp}`;
    const testPassword = 'testpassword123';

    // Test 1: Create SEA user
    console.log('Test 1: Create SEA user');
    const start1 = performance.now();
    try {
      const seaUser = await gunService.createSEAUser(testUsername, testPassword);
      const time1 = performance.now() - start1;
      if (seaUser && seaUser.pub) {
        console.log(`  ✅ User created: ${seaUser.alias} (${seaUser.pub.substring(0, 20)}...) in ${Math.round(time1)}ms`);
        results.push({ name: 'Create SEA user', passed: true });
      } else {
        console.log('  ❌ User creation failed');
        results.push({ name: 'Create SEA user', passed: false, error: 'No pub key returned' });
        return { suiteName: 'User Operations', tests: results, passed: 0, failed: results.length };
      }

      // Test 2: Put user profile
      console.log('Test 2: Put user profile');
      const start2 = performance.now();
      try {
        const userProfile: Partial<User> = {
          profile: {
            username: testUsername,
            publicKey: seaUser.pub,
          },
          settings: {
            theme: 'dark',
          },
        };
        await gunService.putUserProfile(seaUser.pub, userProfile);
        const time2 = performance.now() - start2;
        console.log(`  ✅ Profile updated in ${Math.round(time2)}ms`);
        // Wait longer for GunDB to sync all nested data from flat puts
        await new Promise((resolve) => setTimeout(resolve, 800));
        results.push({ name: 'Put user profile', passed: true });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ Profile update failed: ${errMsg}`);
        results.push({ name: 'Put user profile', passed: false, error: errMsg });
      }

      // Test 3: Get user
      console.log('Test 3: Get user by ID');
      const start3 = performance.now();
      try {
        const user = await gunService.getUser(seaUser.pub);
        const time3 = performance.now() - start3;
        if (user) {
          // Validate that the retrieved data actually contains what we stored
          const hasProfile = user.profile !== undefined && user.profile !== null;
          const hasUsername = user.profile?.username === testUsername;
          const hasPublicKey = user.profile?.publicKey === seaUser.pub;
          const hasSettings = user.settings !== undefined;
          const hasTheme = user.settings?.theme === 'dark';

          if (hasProfile && hasUsername && hasPublicKey && hasSettings && hasTheme) {
            console.log(`  ✅ User retrieved in ${Math.round(time3)}ms`);
            console.log(`     Username: ${user.profile.username}`);
            console.log(`     Theme: ${user.settings?.theme || 'N/A'}`);
            results.push({ name: 'Get user by ID', passed: true });
          } else {
            const missing = [];
            if (!hasProfile) missing.push('profile');
            if (!hasUsername) missing.push('username');
            if (!hasPublicKey) missing.push('publicKey');
            if (!hasSettings) missing.push('settings');
            if (!hasTheme) missing.push('theme');
            console.log(`  ❌ User retrieved but data incomplete: missing ${missing.join(', ')}`);
            results.push({ name: 'Get user by ID', passed: false, error: `Missing data: ${missing.join(', ')}` });
          }
        } else {
          console.log('  ❌ User not found');
          results.push({ name: 'Get user by ID', passed: false, error: 'User not found' });
        }
      } catch (err) {
        let errMsg: string;
        if (err instanceof Error) {
          errMsg = err.message;
        } else if (typeof err === 'object' && err !== null) {
          const gunError = err as GunError;
          errMsg = gunError.message || JSON.stringify(err);
        } else {
          errMsg = String(err);
        }
        console.log(`  ❌ Get user failed: ${errMsg}`);
        results.push({ name: 'Get user by ID', passed: false, error: errMsg });
      }

      // Test 4: Authenticate SEA user
      console.log('Test 4: Authenticate SEA user');
      const gun = gunService.getInstance();
      if (gun) {
        gun.user().leave(); // Logout first
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const start4 = performance.now();
      try {
        const authUser = await gunService.authenticateSEAUser(testUsername, testPassword);
        const time4 = performance.now() - start4;
        if (authUser && authUser.pub) {
          console.log(`  ✅ User authenticated: ${authUser.alias} in ${Math.round(time4)}ms`);
          results.push({ name: 'Authenticate SEA user', passed: true });
        } else {
          console.log('  ❌ Authentication failed');
          results.push({ name: 'Authenticate SEA user', passed: false, error: 'No pub key returned' });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ Authentication failed: ${errMsg}`);
        results.push({ name: 'Authenticate SEA user', passed: false, error: errMsg });
      }

      console.log('\n✅ User operations tests complete!');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Error: ${errMsg}`);
      results.push({ name: 'User operations suite', passed: false, error: errMsg });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'User operations suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'User Operations', tests: results, passed, failed };
}

/**
 * Test document operations
 */
async function testDocumentOperations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Document Operations...\n');

  const results: TestResult[] = [];

  try {
    const timestamp = Date.now();
    const docId = `testdoc_${timestamp}`;
    const testContent = 'This is a test document';

    // Test 1: Create document
    console.log('Test 1: Create document');
    const start1 = performance.now();
    // Note: GunDB has issues with arrays in nested objects when using single .put()
    // The createDocument method uses a single .put() which doesn't work well with arrays
    // This is a known limitation - createDocument should use flat puts like putUserProfile does
    const document: Document = {
      metadata: {
        title: 'Test Document',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastModifiedBy: 'test-user',
      },
      encryptedContent: testContent,
      contentIV: 'test-iv',
      sharing: {
        owner: 'test-user',
        isPublic: false,
        readAccess: [],
        writeAccess: [],
      },
    };
    try {
      await gunService.createDocument(docId, document);
      const time1 = performance.now() - start1;
      console.log(`  ✅ Document created in ${Math.round(time1)}ms`);
      // Wait longer for GunDB to sync all nested data from flat puts
      await new Promise((resolve) => setTimeout(resolve, 800));
      results.push({ name: 'Create document', passed: true });
    } catch (error) {
      const time1 = performance.now() - start1;
      const errorDetails = error as GunError;
      console.log(`  ❌ Document creation failed in ${Math.round(time1)}ms`);
      console.log(`     Error: ${errorDetails.message}`);
      if (errorDetails.details) {
        const detailsStr = typeof errorDetails.details === 'string'
          ? errorDetails.details
          : JSON.stringify(errorDetails.details, null, 2);
        console.log(`     Details: ${detailsStr}`);
      }
      results.push({ name: 'Create document', passed: false, error: errorDetails.message });
      console.log('  ⚠️  Skipping remaining document tests due to creation failure');
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      return { suiteName: 'Document Operations', tests: results, passed, failed };
    }

    // Test 2: Get document
    console.log('Test 2: Get document by ID');
    const start2 = performance.now();
    try {
      const retrievedDoc = await gunService.getDocument(docId);
      const time2 = performance.now() - start2;
      if (retrievedDoc) {
        // Validate that the retrieved data actually contains what we stored
        const hasMetadata = retrievedDoc.metadata !== undefined && retrievedDoc.metadata !== null;
        const hasTitle = retrievedDoc.metadata?.title === 'Test Document';
        const hasEncryptedContent = retrievedDoc.encryptedContent === testContent;
        const hasContentIV = retrievedDoc.contentIV === 'test-iv';
        const hasSharing = retrievedDoc.sharing !== undefined && retrievedDoc.sharing !== null;
        const hasOwner = retrievedDoc.sharing?.owner === 'test-user';

        if (hasMetadata && hasTitle && hasEncryptedContent && hasContentIV && hasSharing && hasOwner) {
          console.log(`  ✅ Document retrieved in ${Math.round(time2)}ms`);
          console.log(`     Title: ${retrievedDoc.metadata.title}`);
          console.log(`     Content length: ${retrievedDoc.encryptedContent.length} chars`);
          results.push({ name: 'Get document by ID', passed: true });
        } else {
          const missing = [];
          if (!hasMetadata) missing.push('metadata');
          if (!hasTitle) missing.push('title');
          if (!hasEncryptedContent) missing.push('encryptedContent');
          if (!hasContentIV) missing.push('contentIV');
          if (!hasSharing) missing.push('sharing');
          if (!hasOwner) missing.push('owner');
          console.log(`  ❌ Document retrieved but data incomplete: missing ${missing.join(', ')}`);
          console.log(`     Title: ${retrievedDoc.metadata?.title || 'missing'}`);
          console.log(`     Content: ${retrievedDoc.encryptedContent ? 'present' : 'missing'}`);
          results.push({ name: 'Get document by ID', passed: false, error: `Missing data: ${missing.join(', ')}` });
        }
      } else {
        console.log('  ❌ Document not found');
        results.push({ name: 'Get document by ID', passed: false, error: 'Document not found' });
      }
    } catch (err) {
      let errMsg: string;
      if (err instanceof Error) {
        errMsg = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const gunError = err as GunError;
        errMsg = gunError.message || JSON.stringify(err);
      } else {
        errMsg = String(err);
      }
      console.log(`  ❌ Get document failed: ${errMsg}`);
      results.push({ name: 'Get document by ID', passed: false, error: errMsg });
    }

    // Test 3: Update document
    console.log('Test 3: Update document');
    const start3 = performance.now();
    try {
      const updatedTitle = 'Updated Test Document';
      const updates: Partial<Document> = {
        metadata: {
          title: updatedTitle,
          createdAt: document.metadata.createdAt,
          updatedAt: Date.now(),
          lastModifiedBy: 'test-user',
        },
      };
      await gunService.updateDocument(docId, updates);
      const time3 = performance.now() - start3;

      // Verify the update actually worked by retrieving the document
      // Wait longer for GunDB to sync nested data structure
      await new Promise((resolve) => setTimeout(resolve, 400));
      const updatedDoc = await gunService.getDocument(docId);

      if (updatedDoc && updatedDoc.metadata?.title === updatedTitle) {
        console.log(`  ✅ Document updated in ${Math.round(time3)}ms`);
        console.log(`     New title: ${updatedDoc.metadata.title}`);
        results.push({ name: 'Update document', passed: true });
      } else {
        const actualTitle = updatedDoc?.metadata?.title || 'missing';
        console.log(`  ❌ Document update failed: title is "${actualTitle}", expected "${updatedTitle}"`);
        results.push({ name: 'Update document', passed: false, error: `Title mismatch: got "${actualTitle}"` });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Update document failed: ${errMsg}`);
      results.push({ name: 'Update document', passed: false, error: errMsg });
    }

    // Test 4: List documents (requires user context)
    console.log('Test 4: List documents');
    const start4 = performance.now();
    try {
      const gun = gunService.getInstance();
      if (gun && gun.user().is) {
        const userId = (gun.user().is as any).pub;
        const docList = await gunService.listDocuments(userId);
        const time4 = performance.now() - start4;
        console.log(`  ✅ Documents listed: ${docList.length} found in ${Math.round(time4)}ms`);
        results.push({ name: 'List documents', passed: true });
      } else {
        console.log('  ⚠️  Cannot list documents (not authenticated)');
        results.push({ name: 'List documents', passed: false, error: 'Not authenticated' });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠️  List documents failed: ${errMsg}`);
      results.push({ name: 'List documents', passed: false, error: errMsg });
    }

    // Test 5: Delete document
    console.log('Test 5: Delete document');
    const start5 = performance.now();
    try {
      await gunService.deleteDocument(docId);
      const time5 = performance.now() - start5;
      console.log(`  ✅ Document deleted in ${Math.round(time5)}ms`);
      results.push({ name: 'Delete document', passed: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Delete document failed: ${errMsg}`);
      results.push({ name: 'Delete document', passed: false, error: errMsg });
    }

    console.log('\n✅ Document operations tests complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'Document operations suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'Document Operations', tests: results, passed, failed };
}

/**
 * Test subscriptions
 */
async function testSubscriptions(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Subscriptions...\n');

  const results: TestResult[] = [];

  try {
    const timestamp = Date.now();
    const docId = `testdoc_sub_${timestamp}`;
    let subscriptionTriggered = false;

    // Test 1: Subscribe to document
    console.log('Test 1: Subscribe to document');
    try {
      const unsubscribeDoc = gunService.subscribeToDocument(docId, (doc) => {
        subscriptionTriggered = true;
        if (doc) {
          console.log(`  📡 Document update received: ${doc.metadata.title}`);
        } else {
          console.log('  📡 Document deleted');
        }
      });
      console.log('  ✅ Subscription created');

      // Create a document to trigger subscription
      const document: Document = {
        metadata: {
          title: 'Subscription Test Document',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'test-user',
        },
        encryptedContent: 'test content',
        contentIV: 'test-iv',
        sharing: {
          owner: 'test-user',
          isPublic: false,
          readAccess: [],
          writeAccess: [],
        },
      };
      try {
        await gunService.createDocument(docId, document);
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (subscriptionTriggered) {
          console.log('  ✅ Subscription triggered');
          results.push({ name: 'Subscribe to document', passed: true });
        } else {
          console.log('  ⚠️  Subscription not triggered (may need more time)');
          results.push({ name: 'Subscribe to document', passed: false, error: 'Subscription not triggered' });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.log(`  ⚠️  Document creation failed: ${errMsg}`);
        console.log('  ⚠️  Cannot test subscription without document creation');
        results.push({ name: 'Subscribe to document', passed: false, error: `Document creation failed: ${errMsg}` });
      }

      // Cleanup
      unsubscribeDoc();
      try {
        await gunService.deleteDocument(docId);
      } catch {
        // Ignore delete errors
      }
      console.log('  ✅ Subscription unsubscribed');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ Subscribe to document failed: ${errMsg}`);
      results.push({ name: 'Subscribe to document', passed: false, error: errMsg });
    }

    // Test 2: Subscribe to user
    console.log('Test 2: Subscribe to user');
    const gun = gunService.getInstance();
    if (gun && gun.user().is) {
      try {
        const userId = (gun.user().is as any).pub;
        let userSubscriptionTriggered = false;

        const unsubscribeUser = gunService.subscribeToUser(userId, (user) => {
          userSubscriptionTriggered = true;
          if (user) {
            console.log(`  📡 User update received: ${user.profile?.username || 'N/A'}`);
          }
        });
        console.log('  ✅ User subscription created');

        // Update user profile to trigger subscription
        await gunService.putUserProfile(userId, {
          profile: {
            username: 'updated-username',
          },
        });
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (userSubscriptionTriggered) {
          console.log('  ✅ User subscription triggered');
          results.push({ name: 'Subscribe to user', passed: true });
        } else {
          console.log('  ⚠️  User subscription not triggered (may need more time)');
          results.push({ name: 'Subscribe to user', passed: false, error: 'Subscription not triggered' });
        }

        unsubscribeUser();
        console.log('  ✅ User subscription unsubscribed');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ Subscribe to user failed: ${errMsg}`);
        results.push({ name: 'Subscribe to user', passed: false, error: errMsg });
      }
    } else {
      console.log('  ⚠️  Cannot test user subscription (not authenticated)');
      results.push({ name: 'Subscribe to user', passed: false, error: 'Not authenticated' });
    }

    console.log('\n✅ Subscription tests complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'Subscription suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'Subscriptions', tests: results, passed, failed };
}

/**
 * Test error handling
 */
async function testErrorHandling(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Error Handling...\n');

  const results: TestResult[] = [];

  try {
    // Test 1: Get non-existent user
    console.log('Test 1: Get non-existent user');
    try {
      const user = await gunService.getUser('non-existent-user-id');
      if (user === null) {
        console.log('  ✅ Correctly returned null for non-existent user');
        results.push({ name: 'Get non-existent user', passed: true });
      } else {
        console.log('  ⚠️  Unexpected result');
        results.push({ name: 'Get non-existent user', passed: false, error: 'Expected null' });
      }
    } catch (error) {
      let errMsg: string;
      if (error instanceof Error) {
        errMsg = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const gunError = error as GunError;
        errMsg = gunError.message || JSON.stringify(error);
      } else {
        errMsg = String(error);
      }
      console.log(`  ⚠️  Error thrown: ${errMsg}`);
      results.push({ name: 'Get non-existent user', passed: false, error: errMsg });
    }

    // Test 2: Get non-existent document
    console.log('Test 2: Get non-existent document');
    try {
      const doc = await gunService.getDocument('non-existent-doc-id');
      if (doc === null) {
        console.log('  ✅ Correctly returned null for non-existent document');
        results.push({ name: 'Get non-existent document', passed: true });
      } else {
        console.log('  ⚠️  Unexpected result');
        results.push({ name: 'Get non-existent document', passed: false, error: 'Expected null' });
      }
    } catch (error) {
      let errMsg: string;
      if (error instanceof Error) {
        errMsg = error.message;
      } else if (typeof error === 'object' && error !== null) {
        const gunError = error as GunError;
        errMsg = gunError.message || JSON.stringify(error);
      } else {
        errMsg = String(error);
      }
      console.log(`  ⚠️  Error thrown: ${errMsg}`);
      results.push({ name: 'Get non-existent document', passed: false, error: errMsg });
    }

    // Test 3: Update non-existent document
    console.log('Test 3: Update non-existent document');
    try {
      await gunService.updateDocument('non-existent-doc-id', {
        metadata: {
          title: 'Updated',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastModifiedBy: 'test',
        },
      });
      console.log('  ⚠️  Update succeeded (unexpected)');
      results.push({ name: 'Update non-existent document', passed: false, error: 'Update should have failed' });
    } catch (error) {
      const gunError = error as GunError;
      if (gunError.code === GunErrorCode.NOT_FOUND) {
        console.log('  ✅ Correctly threw NOT_FOUND error');
        results.push({ name: 'Update non-existent document', passed: true });
      } else {
        console.log(`  ⚠️  Error thrown: ${gunError.message}`);
        results.push({ name: 'Update non-existent document', passed: false, error: gunError.message });
      }
    }

    // Test 4: Operations without initialization (using new instance)
    console.log('Test 4: Operations without initialization');
    const uninitializedService = new GunService();
    try {
      await uninitializedService.getUser('test-id');
      console.log('  ⚠️  Operation succeeded (unexpected)');
      results.push({ name: 'Operations without initialization', passed: false, error: 'Operation should have failed' });
    } catch (error) {
      const gunError = error as GunError;
      if (gunError.code === GunErrorCode.CONNECTION_FAILED) {
        console.log('  ✅ Correctly threw CONNECTION_FAILED error');
        results.push({ name: 'Operations without initialization', passed: true });
      } else {
        console.log(`  ⚠️  Error thrown: ${gunError.message}`);
        results.push({ name: 'Operations without initialization', passed: false, error: gunError.message });
      }
    }

    console.log('\n✅ Error handling tests complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'Error handling suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'Error Handling', tests: results, passed, failed };
}

/**
 * Test connection state management
 */
async function testConnectionState(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Connection State Management...\n');

  const results: TestResult[] = [];

  try {
    // Test 1: Get connection state
    console.log('Test 1: Get connection state');
    const state = gunService.getConnectionState();
    console.log(`  ✅ Connection state: ${state}`);
    results.push({ name: 'Get connection state', passed: true });

    // Test 2: Check offline status
    console.log('Test 2: Check offline status');
    const isOffline = gunService.isOffline();
    console.log(`  ✅ Is offline: ${isOffline}`);
    results.push({ name: 'Check offline status', passed: true });

    // Test 3: Retry connection
    console.log('Test 3: Retry connection');
    try {
      await gunService.retryConnection();
      const newState = gunService.getConnectionState();
      console.log(`  ✅ Connection retry completed, new state: ${newState}`);
      results.push({ name: 'Retry connection', passed: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠️  Connection retry failed: ${errMsg}`);
      results.push({ name: 'Retry connection', passed: false, error: errMsg });
    }

    console.log('\n✅ Connection state tests complete!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Error: ${errorMessage}`);
    results.push({ name: 'Connection state suite', passed: false, error: errorMessage });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  return { suiteName: 'Connection State', tests: results, passed, failed };
}

/**
 * Run all GunDB Service tests
 */
export async function testGunService(): Promise<void> {
  console.log('🚀 Starting GunDB Service Tests\n');
  console.log('='.repeat(60));

  // Check if a user is already logged in and log them out
  const gun = gunService.getInstance();
  if (gun) {
    const currentUser = gun.user();
    if (currentUser.is && currentUser.is.pub) {
      console.log(`\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`);
      gun.user().leave();
      await new Promise((resolve) => setTimeout(resolve, 500));
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

  const docResult = await testDocumentOperations();
  suiteResults.push(docResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const subResult = await testSubscriptions();
  suiteResults.push(subResult);
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
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suiteResults) {
    const suiteTotal = suite.tests.length;
    const suitePassed = suite.passed;
    const suiteFailed = suite.failed;
    totalTests += suiteTotal;
    totalPassed += suitePassed;
    totalFailed += suiteFailed;

    const status = suiteFailed === 0 ? '✅' : '❌';
    console.log(`\n${status} ${suite.suiteName}: ${suitePassed}/${suiteTotal} passed`);

    if (suiteFailed > 0) {
      const failedTests = suite.tests.filter(t => !t.passed);
      for (const test of failedTests) {
        console.log(`   ❌ ${test.name}${test.error ? ` - ${test.error}` : ''}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  const overallStatus = totalFailed === 0 ? '✅' : '❌';
  console.log(`${overallStatus} OVERALL: ${totalPassed}/${totalTests} tests passed`);
  if (totalFailed > 0) {
    console.log(`   ${totalFailed} test(s) failed`);
  }
  console.log('='.repeat(60));
}
