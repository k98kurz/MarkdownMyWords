/**
 * Document Store Browser Tests
 *
 * Tests for document store operations that can be run from browser console.
 */

import { useDocumentStore } from '@/stores/documentStore';
import { holsterService } from '@/services/holsterService';
import { encryptionService } from '@/services/encryptionService';
import { useAuthStore } from '@/stores/authStore';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
} from '@/dev/testRunner';
import { isFailure, isSuccess } from '@k98kurz/functional-result';
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
  const holster = holsterService.getHolster();
  const user = holster.user();
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
}

async function setupTestUser(): Promise<void> {
  console.log('🔐 Setting up test user...');

  const holster = holsterService.getHolster();

  if (holster && holster.user()) {
    holster.user().leave();
  }

  try {
    await holsterService.createUser(TEST_USERNAME, TEST_PASSWORD);
    console.log(`  ✅ Created user: ${TEST_USERNAME}`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    console.log(`  ℹ️  User already exists: ${TEST_USERNAME}`);
  }

  await holsterService.authenticateUser(TEST_USERNAME, TEST_PASSWORD);
  console.log(`  ✅ Authenticated user: ${TEST_USERNAME}`);

  await holsterService.writeProfile();

  console.log('  ✅ Test user setup complete\n');
}

async function cleanupTestUser(): Promise<void> {
  console.log('🔐 Cleaning up test user...');
  const holster = holsterService.getHolster();
  if (holster && holster.user()) {
    holster.user().leave();
    console.log('  Logged out test user');
  }
  console.log(
    '  Local storage not cleared (call clearHolsterStorage() then reload to wipe)'
  );
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
    const fakeDocId1 = holsterService.newId();
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
    const fakeDocId2 = holsterService.newId();
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
//    '⚠️  NOTE: These tests require a recipient user to exist in Holster.\n'
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
//    '⚠️  NOTE: These tests require a recipient user to exist in Holster.\n'
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

/**
 * Regression tests for updateDocument's field-presence contract.
 *
 * Stored title/content/tags on a private doc are already ciphertext; omitted
 * fields must pass through verbatim (never re-encrypted), and a present
 * `tags` key with value undefined must clear tags (DocumentEditor.tsx sends
 * exactly that when the user removes all tags).
 */
async function testUpdateDocumentPartial(): Promise<TestSuiteResult> {
  console.log('Testing updateDocument field-presence contract');
  const runner = new TestRunner('updateDocument partial/clear');

  await runner.run(
    'private doc: content-only update preserves title and tags',
    async () => {
      const title = generateTestTitle('_partial');
      const tags = ['alpha', 'beta'];
      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, 'original content', tags, false);
      assert(isSuccess(createResult), 'createDocument should succeed');
      const docId = createResult.data!.id;
      const userPub = getCurrentUserPubKey();

      const updateResult = await useDocumentStore
        .getState()
        .updateDocument(docId, { content: 'updated content' });
      assert(
        isSuccess(updateResult),
        'updateDocument should succeed' +
          (updateResult.success
            ? ''
            : `: ${JSON.stringify(updateResult.error)}`)
      );

      // In-memory refresh: createDocument set currentDocument with a
      // matching id, so updateDocument re-derives it from the written doc.
      const current = useDocumentStore.getState().currentDocument;
      assert(current, 'currentDocument should be set');
      compareTwoThings(
        { title, content: 'updated content', tags },
        { title: current.title, content: current.content, tags: current.tags },
        'currentDocument after partial update'
      );

      // Persisted round-trip. providedKey bypasses getDocument's authStore
      // check (setupTestUser authenticates via holsterService, so
      // useAuthStore.user is never set).
      const keyResult = await holsterService.readPrivateData([
        'docKeys',
        docId,
      ]);
      assert(isSuccess(keyResult), 'readPrivateData(docKeys) should succeed');
      const getResult = await useDocumentStore
        .getState()
        .getDocument(docId, userPub, keyResult.data);
      assert(
        isSuccess(getResult) && getResult.data,
        'getDocument should succeed'
      );
      compareTwoThings(
        { title, content: 'updated content', tags },
        getResult.data,
        'persisted doc after partial update'
      );

      assert(
        isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
        'deleteDocument should succeed'
      );
    }
  );

  await runner.run(
    'private doc: explicit undefined tags clear them',
    async () => {
      const title = generateTestTitle('_clear');
      const content = 'clear me';
      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, ['gamma', 'delta'], false);
      assert(isSuccess(createResult), 'createDocument should succeed');
      const docId = createResult.data!.id;
      const userPub = getCurrentUserPubKey();

      // Mirrors DocumentEditor.tsx handleSave when the tag list is emptied:
      // the `tags` key is present with value undefined → clear.
      const updateResult = await useDocumentStore
        .getState()
        .updateDocument(docId, { title, content, tags: undefined });
      assert(
        isSuccess(updateResult),
        'updateDocument should succeed' +
          (updateResult.success
            ? ''
            : `: ${JSON.stringify(updateResult.error)}`)
      );

      const current = useDocumentStore.getState().currentDocument;
      assert(current, 'currentDocument should be set');
      compareTwoThings([], current.tags, 'currentDocument tags after clear');

      const keyResult = await holsterService.readPrivateData([
        'docKeys',
        docId,
      ]);
      assert(isSuccess(keyResult), 'readPrivateData(docKeys) should succeed');
      const getResult = await useDocumentStore
        .getState()
        .getDocument(docId, userPub, keyResult.data);
      assert(
        isSuccess(getResult) && getResult.data,
        'getDocument should succeed'
      );
      compareTwoThings([], getResult.data!.tags, 'persisted tags after clear');

      assert(
        isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
        'deleteDocument should succeed'
      );
    }
  );

  await runner.run(
    'public doc: explicit undefined tags clear them',
    async () => {
      const title = generateTestTitle('_clear_pub');
      const content = 'clear me too';
      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, ['epsilon', 'zeta'], true);
      assert(isSuccess(createResult), 'createDocument should succeed');
      const docId = createResult.data!.id;

      const updateResult = await useDocumentStore
        .getState()
        .updateDocument(docId, { title, content, tags: undefined });
      assert(
        isSuccess(updateResult),
        'updateDocument should succeed' +
          (updateResult.success
            ? ''
            : `: ${JSON.stringify(updateResult.error)}`)
      );

      const getResult = await useDocumentStore
        .getState()
        .getDocument(docId, getCurrentUserPubKey());
      assert(
        isSuccess(getResult) && getResult.data,
        'getDocument should succeed'
      );
      compareTwoThings(
        [],
        getResult.data!.tags,
        'persisted public tags after clear'
      );

      assert(
        isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
        'deleteDocument should succeed'
      );
    }
  );

  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Regression guard for transformError dropping plain HolsterError messages.
 *
 * `withDeadline` rejections and `getHolster()`'s INIT_FAILED throw are plain
 * `{code, message, details}` objects, never Error instances — the
 * `instanceof Error` gate used to collapse them to "An unexpected error
 * occurred", discarding the deadline's wedge guidance and the Holster
 * diagnostic. Uses the INIT_FAILED throw (same shape, same branch as the
 * deadline) so the test stays instant instead of waiting out a 45s deadline.
 */
async function testHolsterErrorMapping(): Promise<TestSuiteResult> {
  console.log('Testing HolsterError → DocumentError mapping');
  const runner = new TestRunner('error mapping');

  await runner.run('plain HolsterError preserves its message', async () => {
    const savedHolster = holsterService.holster;
    const savedInitialized = holsterService.isInitialized;
    holsterService.holster = null;
    holsterService.isInitialized = false;
    try {
      const result = await useDocumentStore
        .getState()
        .getDocument('doc_error_mapping', 'pub_error_mapping');
      assert(isFailure(result), 'getDocument should fail while down');
      assert(isDocumentError(result.error), 'Should return DocumentError');
      assert(
        result.error?.code === 'NETWORK_ERROR',
        `expected NETWORK_ERROR, got ${String(result.error?.code)}`
      );
      assert(
        result.error?.message.includes('Holster not initialized') === true,
        `Holster message must survive; got: ${String(result.error?.message)}`
      );
    } finally {
      holsterService.holster = savedHolster;
      holsterService.isInitialized = savedInitialized;
      useDocumentStore.setState({ error: null });
    }
  });

  runner.printResults();
  return runner.getResults();
}

// ============================================================================
// KEY / PRIVACY TRANSITION TESTS
// ============================================================================

/**
 * Overwrite `['docs', docId]` with the doc re-encrypted under `key` —
 * the state changeDocumentKey leaves when it crashes after the ciphertext
 * write is acked but before the key slot collapses. Mirrors the private-doc
 * shape writeOwnDocument stores. `tagsCsv` must be non-empty plaintext.
 */
async function craftEncryptedDoc(
  docId: string,
  key: string,
  doc: { title: string; content: string; tagsCsv: string; createdAt: number },
  failurePrefix: string
): Promise<void> {
  const encTitle = await encryptionService.encrypt(doc.title, key);
  const encContent = await encryptionService.encrypt(doc.content, key);
  const encTags = await encryptionService.encrypt(doc.tagsCsv, key);
  assert(
    encTitle.success && encContent.success && encTags.success,
    `${failurePrefix}: re-encryption should succeed`
  );
  const docWrite = await holsterService.writeUserPath(
    ['docs', docId],
    {
      id: docId,
      title: encTitle.data,
      content: encContent.data,
      tags: encTags.data,
      createdAt: doc.createdAt,
      updatedAt: Date.now(),
      isPublic: false,
    },
    failurePrefix
  );
  assert(docWrite.success, `${failurePrefix}: doc write should succeed`);
}

/**
 * Read the raw stored `['docs', docId]` node (ciphertext fields intact) via
 * listUserItems, which returns inlined entry data. Used to prove a read path
 * did not rewrite the node: the encrypted fields are JSON strings, and SEA
 * encryption is non-deterministic, so a hidden healing re-encrypt would
 * change them.
 */
async function readStoredDoc(docId: string): Promise<Record<string, unknown>> {
  const itemsResult = await holsterService.listUserItems(['docs']);
  assert(isSuccess(itemsResult), 'listUserItems should succeed');
  const item = itemsResult.data.find(
    i => typeof i.data === 'object' && i.data !== null && i.data.id === docId
  );
  assert(item !== undefined, `stored doc ${docId} should be found`);
  assert(
    typeof item.data === 'object' && item.data !== null,
    'stored doc should be an object'
  );
  return item.data;
}

/**
 * Regression tests for write-ordering in privacy/key transitions.
 *
 * Governing rule: never destroy or overwrite the only decryptability
 * material until the replacement representation is durable. During
 * changeDocumentKey the `['docKeys', docId]` slot holds a JSON envelope
 * `{v: 1, active, pending}` from before the doc ciphertext changes until
 * after it is acked; resolveDocumentKey disambiguates by probing and is
 * read-only, so a crashed transition stays recoverable.
 */
async function testKeyTransitions(): Promise<TestSuiteResult> {
  console.log('Testing privacy/key transition write ordering');
  const runner = new TestRunner('key transitions');

  await cleanupDocumentStore();

  // Privacy actions gate on useAuthStore.user, but setupTestUser
  // authenticates via holsterService directly — mirror authStore.login's
  // state for the duration of the gated tests.
  const authGateOn = (): void => {
    useAuthStore.setState({ user: holsterService.getHolster().user() });
  };
  const authGateOff = (): void => {
    useAuthStore.setState({ user: null });
  };

  await runner.run(
    'mid-transition envelope: read recovers via pending, stays read-only',
    async () => {
      const title = generateTestTitle('_midtransition');
      const content = 'mid-transition content';
      const tags = ['alpha', 'beta'];
      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, tags, false);
      assert(isSuccess(createResult), 'createDocument should succeed');
      const docId = createResult.data!.id;

      const key1Result = await holsterService.readPrivateData([
        'docKeys',
        docId,
      ]);
      assert(isSuccess(key1Result), 'read of original key should succeed');
      const key1 = key1Result.data;

      const key2Result = await encryptionService.generateKey();
      assert(key2Result.success, 'generateKey should succeed');
      const key2 = key2Result.data;

      // Recreate the crash point: envelope written and doc re-encrypted
      // under `pending`, collapse never ran.
      const envelopeWrite = await holsterService.writePrivateData(
        ['docKeys', docId],
        JSON.stringify({ v: 1, active: key1, pending: key2 })
      );
      assert(envelopeWrite.success, 'envelope write should succeed');

      await craftEncryptedDoc(
        docId,
        key2,
        {
          title,
          content,
          tagsCsv: 'alpha,beta',
          createdAt: createResult.data!.createdAt,
        },
        'Failed to craft mid-transition doc'
      );

      // resolveDocumentKey must pick `pending` and decrypt through it.
      const meta = await useDocumentStore.getState().getDocumentMetadata(docId);
      assert(
        isSuccess(meta) && meta.data,
        'getDocumentMetadata should succeed mid-transition' +
          (meta.success ? '' : `: ${JSON.stringify(meta.error)}`)
      );
      compareTwoThings(title, meta.data!.title, 'mid-transition title');
      compareTwoThings(tags, meta.data!.tags, 'mid-transition tags');

      // Read-only resolve: no heal/collapse on the read path.
      const slot = await holsterService.readPrivateData(['docKeys', docId]);
      assert(isSuccess(slot), 'slot read after access should succeed');
      let parsedSlot: unknown;
      try {
        parsedSlot = JSON.parse(slot.data);
      } catch {
        parsedSlot = null;
      }
      assert(
        typeof parsedSlot === 'object' && parsedSlot !== null,
        'slot should still hold the envelope after a read'
      );
      const envelope = parsedSlot as Record<string, unknown>;
      assert(
        envelope.v === 1 &&
          envelope.active === key1 &&
          envelope.pending === key2,
        'envelope must be unchanged (resolve is read-only); got: ' + slot.data
      );

      assert(
        isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
        'deleteDocument should succeed'
      );
    }
  );

  await runner.run(
    'crash before doc write: read recovers via active, stays read-only',
    async () => {
      authGateOn();
      try {
        const title = generateTestTitle('_crashbefore');
        const content = 'crash-before content';
        const tags = ['omega'];
        const createResult = await useDocumentStore
          .getState()
          .createDocument(title, content, tags, false);
        assert(isSuccess(createResult), 'createDocument should succeed');
        const docId = createResult.data!.id;

        const key1Result = await holsterService.readPrivateData([
          'docKeys',
          docId,
        ]);
        assert(isSuccess(key1Result), 'read of original key should succeed');
        const key1 = key1Result.data;

        const key2Result = await encryptionService.generateKey();
        assert(key2Result.success, 'generateKey should succeed');
        const key2 = key2Result.data;

        // Crash point: envelope written, doc write never started — the
        // stored ciphertext is still under `active`.
        const envelope = JSON.stringify({ v: 1, active: key1, pending: key2 });
        const envelopeWrite = await holsterService.writePrivateData(
          ['docKeys', docId],
          envelope
        );
        assert(envelopeWrite.success, 'envelope write should succeed');

        const docBefore = await readStoredDoc(docId);

        // resolveDocumentKey must probe `active` first and decrypt through it.
        const meta = await useDocumentStore
          .getState()
          .getDocumentMetadata(docId);
        assert(
          isSuccess(meta) && meta.data,
          'getDocumentMetadata should succeed after crash' +
            (meta.success ? '' : `: ${JSON.stringify(meta.error)}`)
        );
        compareTwoThings(title, meta.data!.title, 'crash-before title');
        compareTwoThings(tags, meta.data!.tags, 'crash-before tags');

        // No providedKey → the full resolveDocumentKey path, incl. content.
        const getResult = await useDocumentStore
          .getState()
          .getDocument(docId, getCurrentUserPubKey());
        assert(
          isSuccess(getResult) && getResult.data,
          'getDocument should succeed via active' +
            (getResult.success ? '' : `: ${JSON.stringify(getResult.error)}`)
        );
        compareTwoThings(
          title,
          getResult.data!.title,
          'crash-before title (getDocument)'
        );
        compareTwoThings(
          content,
          getResult.data!.content,
          'crash-before content'
        );
        compareTwoThings(
          tags,
          getResult.data!.tags,
          'crash-before tags (getDocument)'
        );

        // Read-only resolve: no heal/collapse on either read path.
        const slot = await holsterService.readPrivateData(['docKeys', docId]);
        assert(isSuccess(slot), 'slot read after access should succeed');
        assert(
          slot.data === envelope,
          'envelope must be unchanged (resolve is read-only); got: ' + slot.data
        );

        const docAfter = await readStoredDoc(docId);
        assert(
          docAfter.title === docBefore.title,
          'read must not rewrite stored title'
        );
        assert(
          docAfter.content === docBefore.content,
          'read must not rewrite stored content'
        );
        assert(
          docAfter.tags === docBefore.tags,
          'read must not rewrite stored tags'
        );

        assert(
          isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
          'deleteDocument should succeed'
        );
      } finally {
        authGateOff();
      }
    }
  );

  await runner.run(
    'changeDocumentKey: collapses to plain key, doc decrypts',
    async () => {
      authGateOn();
      try {
        const title = generateTestTitle('_keychange');
        const content = 'key change content';
        const createResult = await useDocumentStore
          .getState()
          .createDocument(title, content, ['gamma'], false);
        assert(isSuccess(createResult), 'createDocument should succeed');
        const docId = createResult.data!.id;
        const newPassword = 'newpassword123';

        const changeResult = await useDocumentStore
          .getState()
          .changeDocumentKey(docId, newPassword);
        assert(
          isSuccess(changeResult),
          'changeDocumentKey should succeed' +
            (changeResult.success
              ? ''
              : `: ${JSON.stringify(changeResult.error)}`)
        );

        // Slot collapsed to the plain new key, not an envelope.
        const slot = await holsterService.readPrivateData(['docKeys', docId]);
        assert(isSuccess(slot), 'slot read after key change should succeed');
        assert(
          slot.data === newPassword,
          `slot should be the plain new key; got: ${slot.data}`
        );

        // The slot path resolves and decrypts (getDocumentMetadata reads
        // through resolveDocumentKey — getDocument's providedKey would
        // bypass it, and the authStore gate is unset in this suite).
        const meta = await useDocumentStore
          .getState()
          .getDocumentMetadata(docId);
        assert(
          isSuccess(meta) && meta.data,
          'getDocumentMetadata should succeed after key change' +
            (meta.success ? '' : `: ${JSON.stringify(meta.error)}`)
        );
        compareTwoThings(title, meta.data!.title, 'title after key change');
        compareTwoThings(['gamma'], meta.data!.tags, 'tags after key change');

        assert(
          isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
          'deleteDocument should succeed'
        );
      } finally {
        authGateOff();
      }
    }
  );

  await runner.run(
    'changeDocumentKey over crashed transition: resolves pending, collapses',
    async () => {
      authGateOn();
      try {
        const title = generateTestTitle('_crashedchange');
        const content = 'crashed transition content';
        const tags = ['delta'];
        const createResult = await useDocumentStore
          .getState()
          .createDocument(title, content, tags, false);
        assert(isSuccess(createResult), 'createDocument should succeed');
        const docId = createResult.data!.id;

        const key1Result = await holsterService.readPrivateData([
          'docKeys',
          docId,
        ]);
        assert(isSuccess(key1Result), 'read of original key should succeed');
        const key1 = key1Result.data;

        const key2Result = await encryptionService.generateKey();
        assert(key2Result.success, 'generateKey should succeed');
        const key2 = key2Result.data;

        // Prior crash: envelope written, doc re-encrypted under `pending`,
        // collapse never ran — the working key must resolve via `pending`.
        const envelopeWrite = await holsterService.writePrivateData(
          ['docKeys', docId],
          JSON.stringify({ v: 1, active: key1, pending: key2 })
        );
        assert(envelopeWrite.success, 'envelope write should succeed');
        await craftEncryptedDoc(
          docId,
          key2,
          {
            title,
            content,
            tagsCsv: 'delta',
            createdAt: createResult.data!.createdAt,
          },
          'Failed to craft crashed-transition doc'
        );

        const newPassword = 'recovered1234';
        const changeResult = await useDocumentStore
          .getState()
          .changeDocumentKey(docId, newPassword);
        assert(
          isSuccess(changeResult),
          'changeDocumentKey should succeed' +
            (changeResult.success
              ? ''
              : `: ${JSON.stringify(changeResult.error)}`)
        );

        // Slot collapsed to the plain new key: the stale envelope pair
        // (key1/key2) was discarded only after the new ciphertext was acked.
        const slot = await holsterService.readPrivateData(['docKeys', docId]);
        assert(isSuccess(slot), 'slot read after key change should succeed');
        assert(
          slot.data === newPassword,
          `slot should be the plain new key; got: ${slot.data}`
        );

        const meta = await useDocumentStore
          .getState()
          .getDocumentMetadata(docId);
        assert(
          isSuccess(meta) && meta.data,
          'getDocumentMetadata should succeed after recovery' +
            (meta.success ? '' : `: ${JSON.stringify(meta.error)}`)
        );
        compareTwoThings(title, meta.data!.title, 'recovered title');
        compareTwoThings(tags, meta.data!.tags, 'recovered tags');

        // End-to-end: the re-encrypted content must decrypt back under the
        // collapsed new key, through resolveDocumentKey (no providedKey).
        const getResult = await useDocumentStore
          .getState()
          .getDocument(docId, getCurrentUserPubKey());
        assert(
          isSuccess(getResult) && getResult.data,
          'getDocument should succeed after recovery' +
            (getResult.success ? '' : `: ${JSON.stringify(getResult.error)}`)
        );
        compareTwoThings(
          title,
          getResult.data!.title,
          'recovered title (getDocument)'
        );
        compareTwoThings(content, getResult.data!.content, 'recovered content');
        compareTwoThings(
          tags,
          getResult.data!.tags,
          'recovered tags (getDocument)'
        );

        assert(
          isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
          'deleteDocument should succeed'
        );
      } finally {
        authGateOff();
      }
    }
  );

  await runner.run(
    'setDocumentPublic: plaintext doc, key slot removed',
    async () => {
      authGateOn();
      try {
        const title = generateTestTitle('_topublic');
        const content = 'going public';
        const createResult = await useDocumentStore
          .getState()
          .createDocument(title, content, [], false);
        assert(isSuccess(createResult), 'createDocument should succeed');
        const docId = createResult.data!.id;

        const pubResult = await useDocumentStore
          .getState()
          .setDocumentPublic(docId);
        assert(
          isSuccess(pubResult),
          'setDocumentPublic should succeed' +
            (pubResult.success ? '' : `: ${JSON.stringify(pubResult.error)}`)
        );

        const slot = await holsterService.readPrivateData(['docKeys', docId]);
        assert(isFailure(slot), 'key slot should be removed after publishing');

        const getResult = await useDocumentStore
          .getState()
          .getDocument(docId, getCurrentUserPubKey());
        assert(
          isSuccess(getResult) && getResult.data,
          'getDocument should succeed for the published doc'
        );
        compareTwoThings(title, getResult.data!.title, 'public title');
        compareTwoThings(content, getResult.data!.content, 'public content');

        assert(
          isSuccess(await useDocumentStore.getState().deleteDocument(docId)),
          'deleteDocument should succeed'
        );
      } finally {
        authGateOff();
      }
    }
  );

  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Run all documentStore tests
 *
 * Run this in browser console: testDocumentStore()
 */
export async function testDocumentStore(
  suiteNumber?: number
): Promise<TestSuiteResult[]> {
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
  console.log('\n' + '='.repeat(60) + '\n');

  const partialResult = await testUpdateDocumentPartial();
  suiteResults.push(partialResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const keyTransitionsResult = await testKeyTransitions();
  suiteResults.push(keyTransitionsResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const errorMappingResult = await testHolsterErrorMapping();
  suiteResults.push(errorMappingResult);
  console.log('\n' + '='.repeat(60) + '\n');

  //  const shareResult = await testShareDocument();
  //  suiteResults.push(shareResult);
  //  console.log('\n' + '='.repeat(60) + '\n');
  //
  //  const unshareResult = await testUnshareDocument();
  //  suiteResults.push(unshareResult);
  //  console.log('\n' + '='.repeat(60) + '\n');

  // Print summary
  printTestSummary(
    suiteResults,
    suiteNumber !== undefined ? `SUITE ${suiteNumber}` : undefined
  );

  await cleanupTestUser();

  return suiteResults;
}
