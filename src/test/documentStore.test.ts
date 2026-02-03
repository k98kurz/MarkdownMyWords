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
import type {
  DocumentError,
  MinimalDocListItem,
  //DocumentAccessEntry,
} from '@/types/document';

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
  actual: unknown
) {
  if (expected == actual) return;
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `expected array; got ${actual}`);
    assert(
      expected.length == actual.length,
      `expected array len ${expected.length}; actual ${actual.length}`
    );
  }
  if (typeof expected == 'object' && expected !== null) {
    assert(
      typeof actual == 'object' && actual !== null,
      'expected non-null, got null'
    );
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    for (let k of Object.keys(expectedObj)) {
      if (Object.prototype.hasOwnProperty.call(expectedObj, k)) {
        assert(
          Object.prototype.hasOwnProperty.call(actualObj, k) &&
          actualObj[k] == expectedObj[k],
          `expected ${JSON.stringify(expected)}; ` +
            `encountered ${JSON.stringify(actual)}`
        );
      }
    }
  }
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
    console.log('  ✅ Logged out test user\n');
  }
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
 * Test createDocument operations (parameterized for public/private)
 */
async function testCreateDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.createDocument()...\n');
  const runner = new TestRunner('createDocument Operations');

  await cleanupDocumentStore();

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Create ${suffix} document`, async () => {
      const title = generateTestTitle(`_${suffix}`);
      const content = `Test ${suffix} content`;
      const tags = ['tag1', 'tag2'];

      const result = await useDocumentStore
        .getState()
        .createDocument(title, content, tags, isPublic);

      assert(
        isSuccess(result),
        'Should succeed creating document: ' +
          `${isSuccess(result) ? 'ok' : JSON.stringify(result.error)}`
      );
      assert(result.data !== undefined, 'Should have document data');

      const doc = result.data!;

      compareTwoThings({ title: title, content: content }, doc);

      const expected = {
        title: title,
        content: content,
        isPublic: isPublic,
        tags: tags,
      };

      compareTwoThings(expected, doc);

      assert(
        useDocumentStore.getState().currentDocument?.id === doc.id,
        'Should set currentDocument'
      );

      compareTwoThings(
        { status: 'READY', error: null },
        useDocumentStore.getState()
      );

      console.log(
        `  Created ${isPublic ? 'public' : 'private'} document: ${doc.id}`
      );
    });
  }

  await runner.run('Create document with no tags', async () => {
    const title = generateTestTitle('_no_tags');
    const content = 'Test content';

    const result = await useDocumentStore
      .getState()
      .createDocument(title, content);

    assertWithDetails(
      isSuccess(result),
      'Should succeed creating document without tags',
      { error: isFailure(result) ? result.error : undefined }
    );
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    const expected = {
      title: title,
      content: content,
      isPublic: false,
    };
    compareTwoThings(expected, doc);

    compareTwoThings(
      { status: 'READY', error: null },
      useDocumentStore.getState()
    );
  });

  await runner.run('Create document with empty tags array', async () => {
    const title = generateTestTitle('_empty_tags');
    const content = 'Test content';

    const result = await useDocumentStore
      .getState()
      .createDocument(title, content, []);

    assertWithDetails(
      isSuccess(result),
      'Should succeed creating document with empty tags',
      { error: isFailure(result) ? result.error : undefined }
    );
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    const expected = {
      title: title,
      content: content,
      isPublic: false,
    };
    compareTwoThings(expected, doc);
    compareTwoThings(
      { status: 'READY', error: null },
      useDocumentStore.getState()
    );
  });

  await runner.run(
    'Non-corruption of state on validation failure',
    async () => {
      const originalDocument = useDocumentStore.getState().currentDocument;
      await useDocumentStore.getState().createDocument('', 'content');
      assert(
        useDocumentStore.getState().currentDocument === originalDocument,
        'Should not set new currentDocument on invalid createDocument'
      );
      compareTwoThings(
        {
          status: 'READY',
          error: 'Title is required',
        },
        useDocumentStore.getState()
      );
    }
  );

  console.log('\n✅ createDocument tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test getDocument operations (parameterized for public/private)
 */
async function testGetDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.getDocument()...\n');
  const runner = new TestRunner('getDocument Operations');

  await cleanupDocumentStore();

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Get existing ${suffix} document`, async () => {
      const title = generateTestTitle(`_get_${suffix}`);
      const content = `${suffix} content to retrieve`;
      const tags = [suffix, 'test'];

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, tags, isPublic);
      assertWithDetails(
        isSuccess(createResult),
        'Should create document first',
        { error: isFailure(createResult) ? createResult.error : undefined }
      );
      const docId = createResult.data!.id;

      await cleanupDocumentStore();

      const getResult = await useDocumentStore.getState().getDocument(docId);

      assertWithDetails(
        isSuccess(getResult),
        'Should retrieve existing document',
        { error: isFailure(getResult) ? getResult.error : undefined }
      );
      assert(getResult.data !== null, 'Should return document (not null)');
      assert(getResult.data!.id === docId, 'Should have matching id');
      assert(
        getResult.data!.title === title,
        'Should have decrypted/matching title'
      );
      assert(
        getResult.data!.content === content,
        'Should have decrypted/matching content'
      );
      assert(
        JSON.stringify(getResult.data!.tags) === JSON.stringify(tags),
        'Should have decrypted/matching tags'
      );
      assert(
        getResult.data!.isPublic === isPublic,
        `Should have isPublic=${isPublic}`
      );
      assert(
        useDocumentStore.getState().currentDocument?.id === docId,
        'Should set currentDocument'
      );

      compareTwoThings(
        { status: 'READY', error: null },
        useDocumentStore.getState()
      );

      console.log(`  Retrieved ${suffix} document: ${docId}`);
    });
  }

  await runner.run(
    'Get non-existent document returns null (not error)',
    async () => {
      const fakeDocId = gunService.newId();
      const getResult = await useDocumentStore
        .getState()
        .getDocument(fakeDocId);
      assert(isSuccess(getResult), 'Should succeed (not throw error)');
      assert(
        getResult.data === null,
        'Should return null for non-existent doc'
      );
      assert(
        useDocumentStore.getState().currentDocument === null,
        'Should not set currentDocument'
      );

      compareTwoThings(
        { status: 'READY', error: null },
        useDocumentStore.getState()
      );
      console.log(`  Non-existent document handled correctly: ${fakeDocId}`);
    }
  );

  await runner.run('Get document without title/content defaults', async () => {
    const title = generateTestTitle('_defaults');
    const content = 'content';

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, undefined, true);
    assertWithDetails(isSuccess(createResult), 'Should create document first', {
      error: isFailure(createResult) ? createResult.error : undefined,
    });
    const docId = createResult.data!.id;

    await cleanupDocumentStore();

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assertWithDetails(
      isSuccess(getResult),
      'Should retrieve existing document',
      { error: isFailure(getResult) ? getResult.error : undefined }
    );
    assert(getResult.data !== null, 'Should return document');
    assert(getResult.data!.title === title, 'Should have title');
    assert(getResult.data!.content === content, 'Should have content');
    assertWithDetails(
      Array.isArray(getResult.data!.tags) && getResult.data!.tags.length === 0,
      'Tags should be empty array',
      {
        actual: getResult.data!.tags,
        expected: [],
      }
    );
    console.log(`  Retrieved document with defaults: ${docId}`);
  });

  console.log('\n✅ getDocument tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test deleteDocument operations (parameterized for public/private)
 */
async function testDeleteDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.deleteDocument()...\n');
  const runner = new TestRunner('deleteDocument Operations');

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Delete existing ${suffix} document`, async () => {
      const title = generateTestTitle(`_delete_${suffix}`);
      const content = `${suffix} content to delete`;

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, undefined, isPublic);
      assertWithDetails(
        isSuccess(createResult),
        'Should create document first',
        { error: isFailure(createResult) ? createResult.error : undefined }
      );
      const docId = createResult.data!.id;

      const deleteResult = await useDocumentStore
        .getState()
        .deleteDocument(docId);

      assertWithDetails(
        isSuccess(deleteResult),
        'Should delete existing document',
        { error: isFailure(deleteResult) ? deleteResult.error : undefined }
      );
      assert(deleteResult.data === undefined, 'Should return void (undefined)');

      const getResult = await useDocumentStore.getState().getDocument(docId);
      assertWithDetails(
        isSuccess(getResult),
        'getDocument should not throw error',
        { error: isFailure(getResult) ? getResult.error : undefined }
      );
      assert(
        getResult.data === null,
        'getDocument should return null after deletion'
      );

      assert(
        useDocumentStore.getState().currentDocument === null,
        'Should clear currentDocument if deleted'
      );

      compareTwoThings(
        { status: 'READY', error: null },
        useDocumentStore.getState()
      );

      console.log(`  Deleted ${suffix} document: ${docId}`);
    });
  }

  await runner.run('Delete non-existent document', async () => {
    const fakeDocId = gunService.newId();
    const deleteResult = await useDocumentStore
      .getState()
      .deleteDocument(fakeDocId);

    assert(isFailure(deleteResult), 'Should fail for non-existent document');
    assert(isDocumentError(deleteResult.error), 'Should return DocumentError');
    assert(
      deleteResult.error?.code === 'NOT_FOUND',
      'Error code should be NOT_FOUND'
    );
    compareTwoThings(
      {
        status: 'READY',
        error: 'Document not found',
      },
      useDocumentStore.getState()
    );
    console.log(`  Non-existent document handled correctly: ${fakeDocId}`);
  });

  await runner.run('State cleanup on deletion', async () => {
    const title = generateTestTitle('_state_cleanup');
    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    assert(
      useDocumentStore.getState().currentDocument?.id === docId,
      'Should have document in currentDocument'
    );

    await useDocumentStore.getState().deleteDocument(docId);

    assert(
      useDocumentStore.getState().currentDocument === null,
      'Should clear currentDocument'
    );

    compareTwoThings(
      { status: 'READY', error: null },
      useDocumentStore.getState()
    );
  });

  await runner.run(
    'Deleted document is removed from documentList',
    async () => {
      const title = generateTestTitle('_list_removal');
      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, 'content', undefined, true);
      assert(isSuccess(createResult), 'Should create document first');
      const docId = createResult.data!.id;
      await useDocumentStore.getState().listDocuments();

      const stateBefore = useDocumentStore.getState();
      const itemBefore = stateBefore.documentList.find(
        item => item.docId === docId
      );
      assert(itemBefore !== undefined, 'Document should be in documentList');

      await useDocumentStore.getState().deleteDocument(docId);

      const stateAfter = useDocumentStore.getState();
      const itemAfter = stateAfter.documentList.find(
        item => item.docId === docId
      );
      assert(itemAfter === undefined, 'Document should be removed from list');
    }
  );

  console.log('\n✅ deleteDocument tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test listDocuments operations
 */
async function testListDocuments(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.listDocuments()...\n');
  const runner = new TestRunner('listDocuments Operations');

  await cleanupDocumentStore();

  await runner.run('List empty documents', async () => {
    const result = await useDocumentStore.getState().listDocuments();
    assertWithDetails(isSuccess(result), 'Should succeed with empty list', {
      error: isFailure(result) ? result.error : undefined,
    });
    assert(Array.isArray(result.data), 'Result data should be array');
    assert(result.data!.length === 0, 'Should return empty array');
    assert(
      useDocumentStore.getState().documentList.length === 0,
      'State documentList should be empty'
    );

    compareTwoThings(
      { status: 'READY', error: null },
      useDocumentStore.getState()
    );
  });

  await runner.run('List documents after creating', async () => {
    await cleanupDocumentStore();

    const title1 = generateTestTitle('_list_1');
    const title2 = generateTestTitle('_list_2');

    const result1 = await useDocumentStore
      .getState()
      .createDocument(title1, 'content1', undefined, true);
    assertWithDetails(isSuccess(result1), 'Should create first document', {
      error: isFailure(result1) ? result1.error : undefined,
    });

    const result2 = await useDocumentStore
      .getState()
      .createDocument(title2, 'content2', undefined, false);
    assertWithDetails(isSuccess(result2), 'Should create second document', {
      error: isFailure(result2) ? result2.error : undefined,
    });

    const listResult = await useDocumentStore.getState().listDocuments();

    assert(isSuccess(listResult), 'Should list documents successfully');
    assert(
      listResult.data!.length >= 2,
      'Should have at least 2 documents in list'
    );

    const doc1 = listResult.data!.find(
      (item: MinimalDocListItem) => item.docId === result1.data!.id
    );
    const doc2 = listResult.data!.find(
      (item: MinimalDocListItem) => item.docId === result2.data!.id
    );

    assert(doc1 !== undefined, 'Should find first document in list');
    assert(doc2 !== undefined, 'Should find second document in list');
    assert(typeof doc1!.soul === 'string', 'Should have soul for doc1');
    assert(typeof doc2!.soul === 'string', 'Should have soul for doc2');
    assert(
      typeof doc1!.createdAt === 'number',
      'Should have createdAt for doc1'
    );
    assert(
      typeof doc2!.updatedAt === 'number',
      'Should have updatedAt for doc2'
    );

    assert(
      useDocumentStore.getState().documentList.length >= 2,
      'State documentList should have at least 2 documents'
    );

    compareTwoThings(
      { status: 'READY', error: null },
      useDocumentStore.getState()
    );
  });

  await runner.run('Minimal data only (no decryption)', async () => {
    await cleanupDocumentStore();

    const title = generateTestTitle('_minimal_data');
    const tags = ['tag1', 'tag2'];

    const result = await useDocumentStore
      .getState()
      .createDocument(title, 'content', tags, false);
    assert(isSuccess(result), 'Should create private document first');

    const listResult = await useDocumentStore.getState().listDocuments();

    assert(isSuccess(listResult), 'Should list documents successfully');

    const docInList = listResult.data!.find(
      (item: MinimalDocListItem) => item.docId === result.data!.id
    );

    assert(docInList !== undefined, 'Should find document in list');
    assert(
      'title' in docInList === false,
      'MinimalDocListItem should not have title field'
    );
    assert(
      'tags' in docInList === false,
      'MinimalDocListItem should not have tags field'
    );
    assert(
      'content' in docInList === false,
      'MinimalDocListItem should not have content field'
    );
    assert('docId' in docInList, 'MinimalDocListItem should have docId field');
    assert('soul' in docInList, 'MinimalDocListItem should have soul field');
    assert(
      'createdAt' in docInList,
      'MinimalDocListItem should have createdAt field'
    );
    assert(
      'updatedAt' in docInList,
      'MinimalDocListItem should have updatedAt field'
    );
  });

  console.log('\n✅ listDocuments tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test getDocumentMetadata operations (parameterized for public/private)
 */
async function testGetDocumentMetadata(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.getDocumentMetadata()...\n');
  const runner = new TestRunner('getDocumentMetadata Operations');

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Get metadata for ${suffix} document`, async () => {
      await cleanupDocumentStore();

      const title = generateTestTitle(`_${suffix}_metadata`);
      const tags = ['tag1', 'tag2'];

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, 'content', tags, isPublic);
      assert(isSuccess(createResult), `Should create ${suffix} document first`);
      const docId = createResult.data!.id;

      const metadataResult = await useDocumentStore
        .getState()
        .getDocumentMetadata(docId);

      assert(isSuccess(metadataResult), 'Should get metadata successfully');
      assert(
        metadataResult.data!.title === title,
        'Should return correct title'
      );
      assert(
        Array.isArray(metadataResult.data!.tags),
        'Should return tags array'
      );
      assert(
        metadataResult.data!.tags!.length === tags.length,
        'Should return all tags'
      );
      assert(
        metadataResult.data!.tags![0] === tags[0],
        'First tag should match'
      );

      compareTwoThings(
        { status: 'READY', error: null },
        useDocumentStore.getState()
      );
    });
  }

  await runner.run('Get metadata for non-existent document', async () => {
    await cleanupDocumentStore();

    const fakeDocId = gunService.newId();
    const metadataResult = await useDocumentStore
      .getState()
      .getDocumentMetadata(fakeDocId);

    assert(isFailure(metadataResult), 'Should fail for non-existent document');
    assert(
      isDocumentError(metadataResult.error),
      'Should return DocumentError'
    );
    assert(
      metadataResult.error?.code === 'NOT_FOUND',
      'Error code should be NOT_FOUND'
    );
    compareTwoThings(
      {
        status: 'READY',
        error: 'Document not found',
      },
      useDocumentStore.getState()
    );
  });

  await runner.run('Metadata does not include content', async () => {
    await cleanupDocumentStore();

    const title = generateTestTitle('_no_content');
    const content = 'This content should not be in metadata';

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const metadataResult = await useDocumentStore
      .getState()
      .getDocumentMetadata(docId);

    assert(isSuccess(metadataResult), 'Should get metadata successfully');
    assert(
      'content' in metadataResult.data! === false,
      'Metadata should not include content field'
    );
    assert(
      'title' in metadataResult.data!,
      'Metadata should include title field'
    );
    assert(
      'tags' in metadataResult.data!,
      'Metadata should include tags field'
    );
  });

  await runner.run('Document without tags', async () => {
    await cleanupDocumentStore();

    const title = generateTestTitle('_no_tags_metadata');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const metadataResult = await useDocumentStore
      .getState()
      .getDocumentMetadata(docId);

    assert(isSuccess(metadataResult), 'Should get metadata successfully');
    assert(metadataResult.data!.title === title, 'Should return title');
    assert(
      metadataResult.data!.tags === undefined,
      'Tags should be undefined if not provided'
    );
  });

  console.log('\n✅ getDocumentMetadata tests complete!');
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

  const createResult = await testCreateDocument();
  suiteResults.push(createResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const getResult = await testGetDocument();
  suiteResults.push(getResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const deleteResult = await testDeleteDocument();
  suiteResults.push(deleteResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const listResult = await testListDocuments();
  suiteResults.push(listResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const metadataResult = await testGetDocumentMetadata();
  suiteResults.push(metadataResult);
  console.log('\n' + '='.repeat(60) + '\n');

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
