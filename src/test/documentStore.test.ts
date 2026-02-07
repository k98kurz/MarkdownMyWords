/**
 * Document Store Browser Tests
 *
 * Tests for document store operations that can be run from browser console.
 */

import { useDocumentStore } from '@/stores/documentStore';
import { gunService } from '@/services/gunService';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
  sleep,
} from '@/utils/testRunner';
import { isFailure, isSuccess } from '@/utils/functionalResult';
import { clearGunDBLocalStorage } from '@/utils/clearGunDB';
import type { DocumentError, MinimalDocListItem } from '@/types/document';

const TEST_USERNAME = 'testuser_doc_tests';
const TEST_PASSWORD = 'testpass123';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique test document title
 */
function generateTestTitle(suffix: string = ''): string {
  return `Test Doc ${Date.now()}_${Math.random().toString(36).substring(7)}${suffix}`;
}

/**
 * Assert helper that works with browser tests
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Assert helper with detailed error messages
 */
function assertWithDetails<T>(
  condition: boolean,
  message: string,
  details: { expected?: T; actual?: T; error?: unknown }
): asserts condition {
  if (!condition) {
    const detailsStr = Object.entries(details)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    throw new Error(`${message}${detailsStr ? ` (${detailsStr})` : ''}`);
  }
}

/**
 * Type guard to check if error is DocumentError
 */
function isDocumentError(error: unknown): error is DocumentError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/**
 * No more retarded mix of a thousand fucking verifyBullshit functions
 */
function compareTwoThings(
  expected: unknown,
  actual: unknown,
  msg: string = 'error'
) {
  if (expected == actual) return;
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `expected array; got ${actual}`);
    assert(
      expected.length == actual.length,
      `${msg}: expected array len ${expected.length}; actual ${actual.length}`
    );
  }
  if (typeof expected == 'object' && expected !== null) {
    assert(
      typeof actual == 'object' && actual !== null,
      `${msg}: expected non-null, got null`
    );
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    for (let k of Object.keys(expectedObj)) {
      if (Object.prototype.hasOwnProperty.call(expectedObj, k)) {
        assert(
          Object.prototype.hasOwnProperty.call(actualObj, k),
          `${msg}: expected to have attribute ${k}; ` +
            `actual ${JSON.stringify(actualObj)}`
        );
        const expectedArr = expectedObj[k] as unknown[];
        const actualArr = actualObj[k] as unknown[];
        if (Array.isArray(expectedObj[k])) {
          for (let i = 0; i < expectedArr.length; i++) {
            if (expectedArr[i] != actualArr[i]) {
              assert(
                false,
                `${msg}: array element mismatch at index ${i}: ` +
                  `expected ${JSON.stringify(expectedArr[i])}, ` +
                  `actual ${JSON.stringify(actualArr[i])}`
              );
            }
          }
        } else {
          assert(
            Object.prototype.hasOwnProperty.call(actualObj, k) &&
              actualObj[k] == expectedObj[k],
            `${msg}: expected ${JSON.stringify(expected)}; ` +
              `encountered ${JSON.stringify(actual)}; ` +
              `failed on ${k}`
          );
        }
      }
    }
  }
}

/**
 * Get current user's public key
 */
function getCurrentUserPubKey(): string {
  const gun = gunService.getGun();
  const user = gun.user();
  if (!user.is || !user.is.pub) {
    throw new Error('User not authenticated');
  }
  return user.is.pub as string;
}

/**
 * Cleanup documentStore state between tests
 */
async function cleanupDocumentStore(): Promise<void> {
  useDocumentStore.setState({
    currentDocument: null,
    documentList: [],
    status: 'READY',
    error: null,
  });
  await sleep(100);
}

async function setupTestUser(): Promise<void> {
  console.log('🔐 Setting up test user...');

  await clearGunDBLocalStorage({
    logout: true,
    clearIndexedDB: true,
    clearLocalStorage: true,
    clearSessionStorage: true,
  });
  await sleep(500);

  const gun = gunService.getGun();

  if (gun && gun.user()) {
    gun.user().leave();
    await sleep(500);
  }

  try {
    await gunService.createUser(TEST_USERNAME, TEST_PASSWORD);
    console.log(`  ✅ Created user: ${TEST_USERNAME}`);
  } catch (error) {
    console.log(`  ℹ️  User already exists: ${TEST_USERNAME}`);
  }

  await gunService.authenticateUser(TEST_USERNAME, TEST_PASSWORD);
  console.log(`  ✅ Authenticated user: ${TEST_USERNAME}`);

  await gunService.writeProfile();
  await sleep(500);

  console.log('  ✅ Test user setup complete\n');
}

async function cleanupTestUser(): Promise<void> {
  console.log('🔐 Cleaning up test user...');
  const gun = gunService.getGun();
  if (gun && gun.user()) {
    gun.user().leave();
    await sleep(500);
    console.log('  Logged out test user');
  }
  await clearGunDBLocalStorage({
    logout: true,
    clearIndexedDB: true,
    clearLocalStorage: true,
    clearSessionStorage: true,
  });
  console.log('  GunDB cleared');
}

// ============================================================================
// TEST SUITES
// ============================================================================

/**
 * Test input validation for createDocument
 */
async function testInputValidation(): Promise<TestSuiteResult> {
  console.log(
    '🧪 Testing documentStore.createDocument() - Input Validation...\n'
  );
  const runner = new TestRunner('createDocument Input Validation');

  await cleanupDocumentStore();

  await runner.run('Empty title fails validation', async () => {
    const result = await useDocumentStore
      .getState()
      .createDocument('', 'content');
    assertWithDetails(isFailure(result), 'Should fail with empty title', {
      actual: result,
    });
    assert(isDocumentError(result.error), 'Should return DocumentError');
    assert(
      result.error?.code === 'VALIDATION_ERROR',
      'Error code should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Title is required',
      'Error message should match exactly'
    );
    assert(
      useDocumentStore.getState().currentDocument === null,
      'Should not set currentDocument'
    );
    compareTwoThings(
      {
        status: 'READY',
        error: 'Title is required',
      },
      useDocumentStore.getState()
    );
  });

  await runner.run('Null content fails validation', async () => {
    const result = await useDocumentStore
      .getState()
      .createDocument('title', null as unknown as string);
    assert(isFailure(result), 'Should fail with null content');
    assert(isDocumentError(result.error), 'Should return DocumentError');
    assert(
      result.error?.code === 'VALIDATION_ERROR',
      'Error code should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Content is required',
      'Error message should match exactly'
    );
  });

  await runner.run('Undefined content fails validation', async () => {
    const result = await useDocumentStore
      .getState()
      .createDocument('title', undefined as unknown as string);
    assert(isFailure(result), 'Should fail with undefined content');
    assert(isDocumentError(result.error), 'Should return DocumentError');
    assert(
      result.error?.code === 'VALIDATION_ERROR',
      'Error code should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Content is required',
      'Error message should match exactly'
    );
  });

  console.log('\n✅ Input validation tests complete!');
  runner.printResults();
  return runner.getResults();
}

/**
 * Test all CRUD operations
 */
async function testCRUDe2e(): Promise<TestSuiteResult> {
  console.log('Testing all documentStore CRUD operations');
  const runner = new TestRunner('documentStore CRUD');

  await cleanupDocumentStore();
  await runner.run('CRUD e2e: happy path', async () => {
    // 1. list documents
    console.log('1. list documents');
    const listResult1 = await useDocumentStore.getState().listDocuments();
    assert(isSuccess(listResult1), 'listDocuments should succeed');
    const initialList = listResult1.data;

    // 2. create a public document
    console.log('2. create a public document');
    const title = generateTestTitle('_public');
    const content = 'Public document content';
    const tags = ['tag1', 'tag2'];
    const createResult1 = await useDocumentStore
      .getState()
      .createDocument(title, content, tags, true);
    assert(isSuccess(createResult1), 'createDocument should succeed');
    compareTwoThings(
      { title, content, isPublic: true, tags },
      createResult1.data,
      'create public document response'
    );
    const docId1 = createResult1.data!.id;

    // 3. get that document
    console.log('3. get that document');
    const userPub = getCurrentUserPubKey();
    const getResult1 = await useDocumentStore
      .getState()
      .getDocument(docId1, userPub);
    assert(isSuccess(getResult1), 'getDocument should succeed');
    compareTwoThings(
      { id: docId1, title, content, isPublic: true, tags },
      getResult1.data,
      'get public document response'
    );

    // 4. update the document
    console.log('4. update the document');
    const newContent = 'Updated public document content';
    const updateResult1 = await useDocumentStore
      .getState()
      .updateDocument(docId1, { content: newContent });
    assert(
      isSuccess(updateResult1),
      'updateDocument should succeed ' +
        (updateResult1.success ? '' : JSON.stringify(updateResult1.error))
    );
    compareTwoThings(undefined, updateResult1.data, 'update document response');

    // 5. get that document again
    console.log('5. get that document again');
    const getResult2 = await useDocumentStore
      .getState()
      .getDocument(docId1, userPub);
    assert(isSuccess(getResult2), 'getDocument should succeed');
    compareTwoThings(
      { id: docId1, title, content: newContent, isPublic: true, tags },
      getResult2.data,
      'get updated document response'
    );

    // 6. create private document
    console.log('6. create private document');
    const title2 = generateTestTitle('_private');
    const content2 = 'Private document content';
    const tags2 = ['tag3', 'tag4'];
    const createResult2 = await useDocumentStore
      .getState()
      .createDocument(title2, content2, tags2, false);
    assert(isSuccess(createResult2), 'createDocument should succeed');
    compareTwoThings(
      { title: title2, content: content2, isPublic: false, tags: tags2 },
      createResult2.data,
      'create private document response'
    );
    const docId2 = createResult2.data!.id;

    // 7. list documents
    console.log('7. list documents');
    const listResult2 = await useDocumentStore.getState().listDocuments();
    assert(isSuccess(listResult2), 'listDocuments should succeed');
    assert(
      initialList.length + 2 === listResult2.data.length,
      'Should have 2 more documents'
    );
    assert(
      listResult2.data!.find(
        (item: MinimalDocListItem) => item.docId === docId1
      ),
      'list should include document 1'
    );
    assert(
      listResult2.data!.find(
        (item: MinimalDocListItem) => item.docId === docId2
      ),
      'list should include document 2'
    );

    // 8. get document metadata
    console.log('8. get document metadata');
    const metadataResult = await useDocumentStore
      .getState()
      .getDocumentMetadata(docId1);
    assert(isSuccess(metadataResult), 'getDocumentMetadata should succeed');
    compareTwoThings(
      { title, tags: tags },
      metadataResult.data,
      'document metadata'
    );
    assert(
      'content' in metadataResult.data === false,
      'Metadata should not include content field'
    );

    // 9. delete first document
    console.log('9. delete first document');
    const deleteResult1 = await useDocumentStore
      .getState()
      .deleteDocument(docId1);
    assert(isSuccess(deleteResult1), 'deleteDocument should succeed');
    compareTwoThings(
      undefined,
      deleteResult1.data,
      'delete first document response'
    );

    // 10. delete second document
    console.log('10. delete second document');
    const deleteResult2 = await useDocumentStore
      .getState()
      .deleteDocument(docId2);
    assert(isSuccess(deleteResult2), 'deleteDocument should succeed');
    compareTwoThings(
      undefined,
      deleteResult2.data,
      'delete second document response'
    );

    // 11. list documents (final)
    console.log('11. list documents (final)');
    const listResult3 = await useDocumentStore.getState().listDocuments();
    assert(isSuccess(listResult3), 'listDocuments should succeed');
    assert(
      initialList.length === listResult3.data.length,
      'Should return to original count'
    );
  });

  await runner.run('CRUD e2e: edge cases', async () => {
    // 1. delete a non-existent doc
    console.log('1. delete a non-existent doc');
    const fakeDocId1 = gunService.newId();
    const deleteResult = await useDocumentStore
      .getState()
      .deleteDocument(fakeDocId1);
    assert(isFailure(deleteResult), 'deleteDocument should fail');
    assert(isDocumentError(deleteResult.error), 'Should return DocumentError');
    compareTwoThings(
      { code: 'NOT_FOUND' },
      deleteResult.error,
      'delete non-existent error code'
    );
    compareTwoThings(
      'Document not found',
      deleteResult.error.message,
      'delete non-existent error message'
    );
    compareTwoThings(
      { status: 'READY', error: 'Document not found' },
      useDocumentStore.getState(),
      'delete non-existent store state'
    );

    // 2. update a non-existent doc
    console.log('2. update a non-existent doc');
    const fakeDocId2 = gunService.newId();
    const updateResult = await useDocumentStore
      .getState()
      .updateDocument(fakeDocId2, { content: 'test' });
    assert(isFailure(updateResult), 'updateDocument should fail');
    assert(isDocumentError(updateResult.error), 'Should return DocumentError');
    compareTwoThings(
      { code: 'NOT_FOUND' },
      updateResult.error,
      'update non-existent error code'
    );
    compareTwoThings(
      'Document not found',
      updateResult.error.message,
      'update non-existent error message'
    );
    compareTwoThings(
      { status: 'READY', error: 'Document not found' },
      useDocumentStore.getState(),
      'update non-existent store state'
    );
  });

  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test shareDocument operations (parameterized for public/private)
 */
//async function testShareDocument(): Promise<TestSuiteResult> {
//  console.log('🧪 Testing documentStore.shareDocument()...\n');
//  console.log(
//    '⚠️  NOTE: These tests require a recipient user to exist in GunDB.\n'
//  );
//
//  const runner = new TestRunner('shareDocument Operations');
//
//  for (const isPublic of [true, false]) {
//    const suffix = isPublic ? 'public' : 'private';
//    await runner.run(`Share ${suffix} document with user`, async () => {
//      await cleanupDocumentStore();
//
//      const title = generateTestTitle(`_share_${suffix}`);
//      const content = `${suffix} content to share`;
//
//      const createResult = await useDocumentStore
//        .getState()
//        .createDocument(title, content, undefined, isPublic);
//      assertWithDetails(
//        isSuccess(createResult),
//        `Should create ${suffix} document first`,
//        { error: isFailure(createResult) ? createResult.error : undefined }
//      );
//      const docId = createResult.data!.id;
//
//      const shareResult = await useDocumentStore
//        .getState()
//        .shareDocument(docId, 'recipient');
//
//      assertWithDetails(
//        isSuccess(shareResult),
//        'Should share document successfully',
//        { error: isFailure(shareResult) ? shareResult.error : undefined }
//      );
//      assert(shareResult.data === undefined, 'Should return void (undefined)');
//
//      const getResult = await useDocumentStore.getState().getDocument(docId);
//      assertWithDetails(isSuccess(getResult), 'Should retrieve document', {
//        error: isFailure(getResult) ? getResult.error : undefined,
//      });
//      assert(getResult.data !== null, 'Should return document');
//      const doc = getResult.data!;
//      assert(Array.isArray(doc.access), 'Should have access array');
//      const accessEntry = doc.access.find(
//        (a: DocumentAccessEntry) => a.userId === 'recipient'
//      );
//      assert(
//        accessEntry !== undefined,
//        'Should have recipient in access array'
//      );
//      if (isPublic) {
//        assert(
//          accessEntry!.docKey === '',
//          'Public doc should have empty encrypted docKey'
//        );
//      } else {
//        assert(
//          accessEntry!.docKey !== '',
//          'Private doc should have encrypted docKey'
//        );
//        assert(
//          typeof accessEntry!.docKey === 'string',
//          'Encrypted docKey should be a string'
//        );
//        assert(
//          accessEntry!.docKey.length > 0,
//          'Encrypted docKey should not be empty'
//        );
//      }
//
//      console.log(`  Shared ${suffix} document: ${docId}`);
//    });
//  }
//
//  await runner.run('Share with non-existent user fails', async () => {
//    await cleanupDocumentStore();
//
//    const title = generateTestTitle('_share_nonexistent');
//
//    const createResult = await useDocumentStore
//      .getState()
//      .createDocument(title, 'content', undefined, true);
//    assert(isSuccess(createResult), 'Should create document first');
//    const docId = createResult.data!.id;
//
//    const shareResult = await useDocumentStore
//      .getState()
//      .shareDocument(docId, 'nonexistent-user');
//
//    assert(isFailure(shareResult), 'Should fail for non-existent user');
//    assert(isDocumentError(shareResult.error), 'Should return DocumentError');
//    assert(
//      shareResult.error?.code === 'NOT_FOUND',
//      'Error code should be NOT_FOUND'
//    );
//    assert(
//      shareResult.error?.message === 'User not found',
//      'Error message should match'
//    );
//    console.log(`  Non-existent user handled correctly: ${docId}`);
//  });
//
//  await runner.run('Share with already shared user succeeds', async () => {
//    await cleanupDocumentStore();
//
//    const title = generateTestTitle('_share_again');
//
//    const createResult = await useDocumentStore
//      .getState()
//      .createDocument(title, 'content', undefined, true);
//    assert(isSuccess(createResult), 'Should create document first');
//    const docId = createResult.data!.id;
//
//    const shareResult1 = await useDocumentStore
//      .getState()
//      .shareDocument(docId, 'recipient');
//    assert(isSuccess(shareResult1), 'Should share first time');
//
//    const shareResult2 = await useDocumentStore
//      .getState()
//      .shareDocument(docId, 'recipient');
//    assert(isSuccess(shareResult2), 'Should succeed (idempotent)');
//
//    const getResult = await useDocumentStore.getState().getDocument(docId);
//    assert(isSuccess(getResult), 'Should retrieve document');
//    const doc = getResult.data!;
//    const accessEntries = (doc.access ?? []).filter(
//      (a: DocumentAccessEntry) => a.userId === 'recipient'
//    );
//    assert(
//      accessEntries.length === 1,
//      'Should only have one access entry for user'
//    );
//
//    console.log(`  Re-share handled correctly: ${docId}`);
//  });
//
//  console.log('\n✅ shareDocument tests complete!');
//  runner.printResults();
//  await cleanupDocumentStore();
//  return runner.getResults();
//}
//
///**
// * Test unshareDocument operations
// */
//async function testUnshareDocument(): Promise<TestSuiteResult> {
//  console.log('🧪 Testing documentStore.unshareDocument()...\n');
//  console.log(
//    '⚠️  NOTE: These tests require a recipient user to exist in GunDB.\n'
//  );
//
//  const runner = new TestRunner('unshareDocument Operations');
//
//  for (const isPublic of [true, false]) {
//    const suffix = isPublic ? 'public' : 'private';
//    await runner.run(`Unshare ${suffix} document from user`, async () => {
//      await cleanupDocumentStore();
//
//      const title = generateTestTitle(`_unshare_${suffix}`);
//      const content = `${suffix} content to share`;
//
//      const createResult = await useDocumentStore
//        .getState()
//        .createDocument(title, content, undefined, isPublic);
//      assertWithDetails(
//        isSuccess(createResult),
//        `Should create ${suffix} document first`,
//        { error: isFailure(createResult) ? createResult.error : undefined }
//      );
//      const docId = createResult.data!.id;
//
//      const shareResult = await useDocumentStore
//        .getState()
//        .shareDocument(docId, 'recipient');
//      assertWithDetails(isSuccess(shareResult), 'Should share document first', {
//        error: isFailure(shareResult) ? shareResult.error : undefined,
//      });
//
//      const unshareResult = await useDocumentStore
//        .getState()
//        .unshareDocument(docId, 'recipient');
//
//      assertWithDetails(
//        isSuccess(unshareResult),
//        'Should unshare document successfully',
//        { error: isFailure(unshareResult) ? unshareResult.error : undefined }
//      );
//      assert(
//        unshareResult.data === undefined,
//        'Should return void (undefined)'
//      );
//
//      const getResult = await useDocumentStore.getState().getDocument(docId);
//      assertWithDetails(isSuccess(getResult), 'Should retrieve document', {
//        error: isFailure(getResult) ? getResult.error : undefined,
//      });
//      assert(getResult.data !== null, 'Should return document');
//      const doc = getResult.data!;
//      assert(Array.isArray(doc.access), 'Should have access array');
//      const accessEntry = doc.access.find(
//        (a: DocumentAccessEntry) => a.userId === 'recipient'
//      );
//      assert(
//        accessEntry === undefined,
//        'Should not have recipient in access array'
//      );
//
//      console.log(`  Unshared ${suffix} document: ${docId}`);
//    });
//  }
//
//  await runner.run('Unshare from non-existent document fails', async () => {
//    await cleanupDocumentStore();
//
//    const nonExistentDocId = 'nonexistent-doc-id';
//
//    const unshareResult = await useDocumentStore
//      .getState()
//      .unshareDocument(nonExistentDocId, 'recipient');
//
//    assert(isFailure(unshareResult), 'Should fail for non-existent document');
//    assert(isDocumentError(unshareResult.error), 'Should return DocumentError');
//    assert(
//      unshareResult.error?.code === 'NOT_FOUND',
//      'Error code should be NOT_FOUND'
//    );
//    assert(
//      unshareResult.error?.message === 'Document not found',
//      'Error message should match'
//    );
//    console.log(
//      `  Non-existent document handled correctly: ${nonExistentDocId}`
//    );
//  });
//
//  await runner.run(
//    'Unshare from user not in access list succeeds',
//    async () => {
//      const title = generateTestTitle('_unshare_not_in_access');
//
//      const createResult = await useDocumentStore
//        .getState()
//        .createDocument(title, 'content', undefined, true);
//      assert(isSuccess(createResult), 'Should create document first');
//      const docId = createResult.data!.id;
//
//      const unshareResult = await useDocumentStore
//        .getState()
//        .unshareDocument(docId, 'non-recipient');
//      assert(isSuccess(unshareResult), 'Should succeed (idempotent)');
//
//      const getResult = await useDocumentStore.getState().getDocument(docId);
//      assert(isSuccess(getResult), 'Should retrieve document');
//      const doc = getResult.data!;
//      assert(Array.isArray(doc.access), 'Should have access array');
//      const accessEntry = doc.access.find(
//        (a: DocumentAccessEntry) => a.userId === 'non-recipient'
//      );
//      assert(accessEntry === undefined, 'Should not have user in access array');
//
//      console.log(`  Unshare from non-shared user handled correctly: ${docId}`);
//    }
//  );
//
//  await runner.run('Unshare removes only specified user', async () => {
//    const title = generateTestTitle('_unshare_specific_user');
//
//    const createResult = await useDocumentStore
//      .getState()
//      .createDocument(title, 'content', undefined, true);
//    assert(isSuccess(createResult), 'Should create document first');
//    const docId = createResult.data!.id;
//
//    const shareResult1 = await useDocumentStore
//      .getState()
//      .shareDocument(docId, 'recipient1');
//    assert(isSuccess(shareResult1), 'Should share with first recipient');
//
//    const shareResult2 = await useDocumentStore
//      .getState()
//      .shareDocument(docId, 'recipient2');
//    assert(isSuccess(shareResult2), 'Should share with second recipient');
//
//    const unshareResult = await useDocumentStore
//      .getState()
//      .unshareDocument(docId, 'recipient1');
//    assert(isSuccess(unshareResult), 'Should unshare first recipient');
//
//    const getResult = await useDocumentStore.getState().getDocument(docId);
//    assert(isSuccess(getResult), 'Should retrieve document');
//    const doc = getResult.data!;
//    assert(Array.isArray(doc.access), 'Should have access array');
//    const accessEntry1 = doc.access.find(
//      (a: DocumentAccessEntry) => a.userId === 'recipient1'
//    );
//    assert(accessEntry1 === undefined, 'Should not have first recipient');
//    const accessEntry2 = doc.access.find(
//      (a: DocumentAccessEntry) => a.userId === 'recipient2'
//    );
//    assert(accessEntry2 !== undefined, 'Should still have second recipient');
//
//    console.log(`  Only specified user removed from access: ${docId}`);
//  });
//
//  console.log('\n✅ unshareDocument tests complete!');
//  runner.printResults();
//  await cleanupDocumentStore();
//  return runner.getResults();
//}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Run all documentStore tests
 *
 * Run this in browser console: testDocumentStore()
 */
export async function testDocumentStore(): Promise<TestSuiteResult[]> {
  console.log('🚀 Starting Document Store Tests\n');
  console.log('='.repeat(60));

  const suiteResults: TestSuiteResult[] = [];

  await setupTestUser();
  console.log('='.repeat(60) + '\n');

  const inputValidationResult = await testInputValidation();
  suiteResults.push(inputValidationResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const e2eResult = await testCRUDe2e();
  suiteResults.push(e2eResult);
  console.log('='.repeat(60));

  //  const shareResult = await testShareDocument();
  //  suiteResults.push(shareResult);
  //  console.log('\n' + '='.repeat(60) + '\n');
  //
  //  const unshareResult = await testUnshareDocument();
  //  suiteResults.push(unshareResult);
  //  console.log('\n' + '='.repeat(60) + '\n');

  // Print summary
  printTestSummary(suiteResults);

  await cleanupTestUser();

  return suiteResults;
}
