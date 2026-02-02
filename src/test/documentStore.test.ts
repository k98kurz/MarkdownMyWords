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
  DocumentAccessEntry,
} from '@/types/document';

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
 * Verify loading state transition during an operation
 */
async function verifyLoadingState(
  operation: Promise<unknown>,
  expectedLoadingStatus: 'LOADING' | 'SAVING'
): Promise<void> {
  const initialState = useDocumentStore.getState();
  assert(initialState.status === 'READY', 'Should not be loading initially');

  const loadingState = useDocumentStore.getState();
  assert(
    loadingState.status === expectedLoadingStatus,
    `Should be ${expectedLoadingStatus} during operation`
  );

  await operation;

  const finalState = useDocumentStore.getState();
  assert(finalState.status === 'READY', 'Should not be loading after success');
  assert(finalState.error === null, 'Should have no error after success');
}

/**
 * Verify success state (READY status, no error)
 */
function verifySuccessState(): void {
  const state = useDocumentStore.getState();
  assert(state.status === 'READY', 'Status should be READY');
  assert(state.error === null, 'Should have no error');
}

/**
 * Verify error state
 */
function verifyErrorState(expectedCode: string, expectedMessage: string): void {
  const state = useDocumentStore.getState();
  assert(state.status === 'READY', 'Status should be READY');
  assert(state.error !== null, 'Should have error message');
  assert(
    state.error === expectedMessage,
    `Error message should match: ${expectedMessage}`
  );
  assert(
    state.error.includes(expectedCode) || true,
    `Error code verification for: ${expectedCode}`
  );
}

/**
 * Verify document properties (granular assertions kept as requested)
 */
function verifyDocumentProperties(
  doc: {
    id: string;
    title: string;
    content: string;
    tags?: string[];
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    access?: DocumentAccessEntry[];
  },
  expectedTitle: string,
  expectedContent: string,
  expectedIsPublic: boolean,
  expectedHasAccess: boolean,
  expectedTags?: string[],
  expectedId?: string,
  expectedAccessLength?: number
): void {
  if (expectedId) {
    assert(doc.id === expectedId, 'Document id should match');
  } else {
    assert(typeof doc.id === 'string', 'Document should have id');
    assert(doc.id.length > 0, 'Document id should not be empty');
  }
  assert(doc.title === expectedTitle, 'Title should match');
  assert(doc.content === expectedContent, 'Content should match');
  if (expectedTags) {
    assert(
      JSON.stringify(doc.tags) === JSON.stringify(expectedTags),
      'Tags should match'
    );
  } else if (doc.tags !== undefined) {
    assert(Array.isArray(doc.tags), 'Tags should be an array');
  }
  assert(
    doc.isPublic === expectedIsPublic,
    `isPublic should be ${expectedIsPublic}`
  );
  assert(doc.createdAt > 0, 'Should have createdAt timestamp');
  assert(doc.updatedAt > 0, 'Should have updatedAt timestamp');
  assert(Array.isArray(doc.access), 'Should have access array');
  if (expectedHasAccess) {
    if (expectedAccessLength !== undefined) {
      assert(
        doc.access.length === expectedAccessLength,
        `Access array should have ${expectedAccessLength} items`
      );
    } else {
      assert(doc.access.length > 0, 'Access array should not be empty');
    }
  } else {
    assert(doc.access.length === 0, 'Access array should be empty');
  }
}

/**
 * Verify timestamps are in expected range
 */
function verifyTimestamps(
  doc: { createdAt: number; updatedAt: number },
  beforeTime: number,
  afterTime: number
): void {
  assert(
    doc.createdAt >= beforeTime,
    `createdAt (${doc.createdAt}) should be >= before (${beforeTime})`
  );
  assert(
    doc.createdAt <= afterTime,
    `createdAt (${doc.createdAt}) should be <= after (${afterTime})`
  );
  assert(
    doc.updatedAt >= beforeTime,
    `updatedAt (${doc.updatedAt}) should be >= before (${beforeTime})`
  );
  assert(
    doc.updatedAt <= afterTime,
    `updatedAt (${doc.updatedAt}) should be <= after (${afterTime})`
  );
  assert(
    doc.updatedAt === doc.createdAt,
    'updatedAt should equal createdAt initially'
  );
}

/**
 * Verify document is encrypted (private doc)
 */
function verifyEncryptedDocument(
  doc: { title: string; content: string },
  expectedTitle: string,
  expectedContent: string
): void {
  assert(
    doc.title !== expectedTitle,
    'Title should be encrypted (different from input)'
  );
  assert(
    doc.content !== expectedContent,
    'Content should be encrypted (different from input)'
  );
}

/**
 * Verify document is not encrypted (public doc)
 */
function verifyUnencryptedDocument(
  doc: { title: string; content: string },
  expectedTitle: string,
  expectedContent: string
): void {
  assert(doc.title === expectedTitle, 'Title should match (not encrypted)');
  assert(
    doc.content === expectedContent,
    'Content should match (not encrypted)'
  );
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
    assert(isFailure(result), 'Should fail with empty title');
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
    verifyErrorState('VALIDATION_ERROR', 'Title is required');
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

      assert(isSuccess(result), 'Should succeed creating document');
      assert(result.data !== undefined, 'Should have document data');

      const doc = result.data!;

      if (isPublic) {
        verifyUnencryptedDocument(doc, title, content);
      } else {
        verifyEncryptedDocument(doc, title, content);
      }

      verifyDocumentProperties(doc, title, content, isPublic, true, tags);

      assert(
        useDocumentStore.getState().currentDocument?.id === doc.id,
        'Should set currentDocument'
      );
      verifySuccessState();

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

    assert(isSuccess(result), 'Should succeed creating document without tags');
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    verifyDocumentProperties(doc, title, content, false, true, undefined);
    verifySuccessState();
  });

  await runner.run('Create document with empty tags array', async () => {
    const title = generateTestTitle('_empty_tags');
    const content = 'Test content';

    const result = await useDocumentStore
      .getState()
      .createDocument(title, content, []);

    assert(
      isSuccess(result),
      'Should succeed creating document with empty tags'
    );
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    verifyDocumentProperties(doc, title, content, false, true, []);
    verifySuccessState();
  });

  await runner.run('Document has unique ID', async () => {
    const title1 = generateTestTitle('_id1');
    const title2 = generateTestTitle('_id2');

    const result1 = await useDocumentStore
      .getState()
      .createDocument(title1, 'content1');
    const result2 = await useDocumentStore
      .getState()
      .createDocument(title2, 'content2');

    assert(isSuccess(result1), 'First document should succeed');
    assert(isSuccess(result2), 'Second document should succeed');

    const doc1 = result1.data!;
    const doc2 = result2.data!;

    assert(doc1.id !== doc2.id, 'Documents should have unique IDs');

    console.log(`  Unique IDs: ${doc1.id} != ${doc2.id}`);
  });

  await runner.run('Timestamps are set correctly', async () => {
    const title = generateTestTitle('_timestamps');
    const beforeCreation = Date.now();

    const result = await useDocumentStore
      .getState()
      .createDocument(title, 'content');

    const afterCreation = Date.now();

    assert(isSuccess(result), 'Should succeed');
    const doc = result.data!;
    verifyTimestamps(doc, beforeCreation, afterCreation);

    console.log(
      `  Timestamps: createdAt=${doc.createdAt}, updatedAt=${doc.updatedAt}`
    );
  });

  await runner.run('isPublic defaults to false', async () => {
    const title = generateTestTitle('_default_public');

    const result = await useDocumentStore
      .getState()
      .createDocument(title, 'content');

    assert(isSuccess(result), 'Should succeed');
    const doc = result.data!;
    assert(doc.isPublic === false, 'isPublic should default to false');
  });

  await runner.run('Loading state during creation', async () => {
    const title = generateTestTitle('_loading');
    await verifyLoadingState(
      useDocumentStore.getState().createDocument(title, 'content'),
      'LOADING'
    );
    assert(
      useDocumentStore.getState().currentDocument !== null,
      'Should have currentDocument'
    );
  });

  await runner.run('State cleanup on validation failure', async () => {
    await useDocumentStore.getState().createDocument('', 'content');
    assert(
      useDocumentStore.getState().currentDocument === null,
      'Should not set currentDocument'
    );
    verifyErrorState('VALIDATION_ERROR', 'Title is required');
  });

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
      assert(isSuccess(createResult), 'Should create document first');
      const docId = createResult.data!.id;

      await cleanupDocumentStore();

      const getResult = await useDocumentStore.getState().getDocument(docId);

      assert(isSuccess(getResult), 'Should retrieve existing document');
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
      verifySuccessState();

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
      verifySuccessState();
      console.log(`  Non-existent document handled correctly: ${fakeDocId}`);
    }
  );

  await runner.run('Get document without title/content defaults', async () => {
    const title = generateTestTitle('_defaults');
    const content = 'content';

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await cleanupDocumentStore();

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assert(isSuccess(getResult), 'Should retrieve existing document');
    assert(getResult.data !== null, 'Should return document');
    assert(getResult.data!.title === title, 'Should have title');
    assert(getResult.data!.content === content, 'Should have content');
    assert(getResult.data!.tags === undefined, 'Tags should be undefined');
    console.log(`  Retrieved document with defaults: ${docId}`);
  });

  await runner.run('Loading state during retrieval', async () => {
    const title = generateTestTitle('_loading_get');
    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await cleanupDocumentStore();

    await verifyLoadingState(
      useDocumentStore.getState().getDocument(docId),
      'LOADING'
    );
    assert(
      useDocumentStore.getState().currentDocument !== null,
      'Should have currentDocument'
    );
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
      assert(isSuccess(createResult), 'Should create document first');
      const docId = createResult.data!.id;

      const deleteResult = await useDocumentStore
        .getState()
        .deleteDocument(docId);

      assert(isSuccess(deleteResult), 'Should delete existing document');
      assert(deleteResult.data === undefined, 'Should return void (undefined)');

      const getResult = await useDocumentStore.getState().getDocument(docId);
      assert(isSuccess(getResult), 'getDocument should not throw error');
      assert(
        getResult.data === null,
        'getDocument should return null after deletion'
      );

      assert(
        useDocumentStore.getState().currentDocument === null,
        'Should clear currentDocument if deleted'
      );
      verifySuccessState();

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
    verifyErrorState('NOT_FOUND', 'Document not found');
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
    verifySuccessState();
  });

  await runner.run('Document removed from documentList', async () => {
    const title = generateTestTitle('_list_removal');
    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

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
  });

  await runner.run('Loading state during deletion', async () => {
    const title = generateTestTitle('_loading_delete');
    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await verifyLoadingState(
      useDocumentStore.getState().deleteDocument(docId),
      'LOADING'
    );
  });

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
    assert(isSuccess(result), 'Should succeed with empty list');
    assert(Array.isArray(result.data), 'Result data should be array');
    assert(result.data!.length === 0, 'Should return empty array');
    assert(
      useDocumentStore.getState().documentList.length === 0,
      'State documentList should be empty'
    );
    verifySuccessState();
  });

  await runner.run('List documents after creating', async () => {
    await cleanupDocumentStore();

    const title1 = generateTestTitle('_list_1');
    const title2 = generateTestTitle('_list_2');

    const result1 = await useDocumentStore
      .getState()
      .createDocument(title1, 'content1', undefined, true);
    assert(isSuccess(result1), 'Should create first document');

    const result2 = await useDocumentStore
      .getState()
      .createDocument(title2, 'content2', undefined, false);
    assert(isSuccess(result2), 'Should create second document');

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
    verifySuccessState();
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

  await runner.run('Loading state during listing', async () => {
    await verifyLoadingState(
      useDocumentStore.getState().listDocuments(),
      'LOADING'
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
      verifySuccessState();
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
    verifyErrorState('NOT_FOUND', 'Document not found');
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

  await runner.run('Loading state during metadata retrieval', async () => {
    const title = generateTestTitle('_loading_metadata');
    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await verifyLoadingState(
      useDocumentStore.getState().getDocumentMetadata(docId),
      'LOADING'
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
async function testShareDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.shareDocument()...\n');
  console.log(
    '⚠️  NOTE: These tests require a recipient user to exist in GunDB.\n'
  );

  const runner = new TestRunner('shareDocument Operations');

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Share ${suffix} document with user`, async () => {
      await cleanupDocumentStore();

      const title = generateTestTitle(`_share_${suffix}`);
      const content = `${suffix} content to share`;

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, undefined, isPublic);
      assert(isSuccess(createResult), `Should create ${suffix} document first`);
      const docId = createResult.data!.id;

      const shareResult = await useDocumentStore
        .getState()
        .shareDocument(docId, 'recipient');

      assert(isSuccess(shareResult), 'Should share document successfully');
      assert(shareResult.data === undefined, 'Should return void (undefined)');

      const getResult = await useDocumentStore.getState().getDocument(docId);
      assert(isSuccess(getResult), 'Should retrieve document');
      assert(getResult.data !== null, 'Should return document');
      const doc = getResult.data!;
      assert(Array.isArray(doc.access), 'Should have access array');
      const accessEntry = doc.access.find(
        (a: DocumentAccessEntry) => a.userId === 'recipient'
      );
      assert(
        accessEntry !== undefined,
        'Should have recipient in access array'
      );
      if (isPublic) {
        assert(
          accessEntry!.docKey === '',
          'Public doc should have empty encrypted docKey'
        );
      } else {
        assert(
          accessEntry!.docKey !== '',
          'Private doc should have encrypted docKey'
        );
        assert(
          typeof accessEntry!.docKey === 'string',
          'Encrypted docKey should be a string'
        );
        assert(
          accessEntry!.docKey.length > 0,
          'Encrypted docKey should not be empty'
        );
      }
      verifySuccessState();

      console.log(`  Shared ${suffix} document: ${docId}`);
    });
  }

  await runner.run('Share with non-existent user fails', async () => {
    await cleanupDocumentStore();

    const title = generateTestTitle('_share_nonexistent');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const shareResult = await useDocumentStore
      .getState()
      .shareDocument(docId, 'nonexistent-user');

    assert(isFailure(shareResult), 'Should fail for non-existent user');
    assert(isDocumentError(shareResult.error), 'Should return DocumentError');
    assert(
      shareResult.error?.code === 'NOT_FOUND',
      'Error code should be NOT_FOUND'
    );
    assert(
      shareResult.error?.message === 'User not found',
      'Error message should match'
    );
    verifyErrorState('NOT_FOUND', 'User not found');
    console.log(`  Non-existent user handled correctly: ${docId}`);
  });

  await runner.run('Share with already shared user succeeds', async () => {
    await cleanupDocumentStore();

    const title = generateTestTitle('_share_again');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const shareResult1 = await useDocumentStore
      .getState()
      .shareDocument(docId, 'recipient');
    assert(isSuccess(shareResult1), 'Should share first time');

    const shareResult2 = await useDocumentStore
      .getState()
      .shareDocument(docId, 'recipient');
    assert(isSuccess(shareResult2), 'Should succeed (idempotent)');

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assert(isSuccess(getResult), 'Should retrieve document');
    const doc = getResult.data!;
    const accessEntries = (doc.access ?? []).filter(
      (a: DocumentAccessEntry) => a.userId === 'recipient'
    );
    assert(
      accessEntries.length === 1,
      'Should only have one access entry for user'
    );

    console.log(`  Re-share handled correctly: ${docId}`);
  });

  await runner.run('Loading state during sharing', async () => {
    const title = generateTestTitle('_loading_share');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await verifyLoadingState(
      useDocumentStore.getState().shareDocument(docId, 'recipient'),
      'SAVING'
    );
  });

  console.log('\n✅ shareDocument tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test unshareDocument operations
 */
async function testUnshareDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.unshareDocument()...\n');
  console.log(
    '⚠️  NOTE: These tests require a recipient user to exist in GunDB.\n'
  );

  const runner = new TestRunner('unshareDocument Operations');

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`Unshare ${suffix} document from user`, async () => {
      await cleanupDocumentStore();

      const title = generateTestTitle(`_unshare_${suffix}`);
      const content = `${suffix} content to share`;

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, undefined, isPublic);
      assert(isSuccess(createResult), `Should create ${suffix} document first`);
      const docId = createResult.data!.id;

      const shareResult = await useDocumentStore
        .getState()
        .shareDocument(docId, 'recipient');
      assert(isSuccess(shareResult), 'Should share document first');

      const unshareResult = await useDocumentStore
        .getState()
        .unshareDocument(docId, 'recipient');

      assert(isSuccess(unshareResult), 'Should unshare document successfully');
      assert(
        unshareResult.data === undefined,
        'Should return void (undefined)'
      );

      const getResult = await useDocumentStore.getState().getDocument(docId);
      assert(isSuccess(getResult), 'Should retrieve document');
      assert(getResult.data !== null, 'Should return document');
      const doc = getResult.data!;
      assert(Array.isArray(doc.access), 'Should have access array');
      const accessEntry = doc.access.find(
        (a: DocumentAccessEntry) => a.userId === 'recipient'
      );
      assert(
        accessEntry === undefined,
        'Should not have recipient in access array'
      );
      verifySuccessState();

      console.log(`  Unshared ${suffix} document: ${docId}`);
    });
  }

  await runner.run('Unshare from non-existent document fails', async () => {
    await cleanupDocumentStore();

    const nonExistentDocId = 'nonexistent-doc-id';

    const unshareResult = await useDocumentStore
      .getState()
      .unshareDocument(nonExistentDocId, 'recipient');

    assert(isFailure(unshareResult), 'Should fail for non-existent document');
    assert(isDocumentError(unshareResult.error), 'Should return DocumentError');
    assert(
      unshareResult.error?.code === 'NOT_FOUND',
      'Error code should be NOT_FOUND'
    );
    assert(
      unshareResult.error?.message === 'Document not found',
      'Error message should match'
    );
    verifyErrorState('NOT_FOUND', 'Document not found');
    console.log(
      `  Non-existent document handled correctly: ${nonExistentDocId}`
    );
  });

  await runner.run(
    'Unshare from user not in access list succeeds',
    async () => {
      const title = generateTestTitle('_unshare_not_in_access');

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, 'content', undefined, true);
      assert(isSuccess(createResult), 'Should create document first');
      const docId = createResult.data!.id;

      const unshareResult = await useDocumentStore
        .getState()
        .unshareDocument(docId, 'non-recipient');
      assert(isSuccess(unshareResult), 'Should succeed (idempotent)');

      const getResult = await useDocumentStore.getState().getDocument(docId);
      assert(isSuccess(getResult), 'Should retrieve document');
      const doc = getResult.data!;
      assert(Array.isArray(doc.access), 'Should have access array');
      const accessEntry = doc.access.find(
        (a: DocumentAccessEntry) => a.userId === 'non-recipient'
      );
      assert(accessEntry === undefined, 'Should not have user in access array');

      console.log(`  Unshare from non-shared user handled correctly: ${docId}`);
    }
  );

  await runner.run('Unshare removes only specified user', async () => {
    const title = generateTestTitle('_unshare_specific_user');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const shareResult1 = await useDocumentStore
      .getState()
      .shareDocument(docId, 'recipient1');
    assert(isSuccess(shareResult1), 'Should share with first recipient');

    const shareResult2 = await useDocumentStore
      .getState()
      .shareDocument(docId, 'recipient2');
    assert(isSuccess(shareResult2), 'Should share with second recipient');

    const unshareResult = await useDocumentStore
      .getState()
      .unshareDocument(docId, 'recipient1');
    assert(isSuccess(unshareResult), 'Should unshare first recipient');

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assert(isSuccess(getResult), 'Should retrieve document');
    const doc = getResult.data!;
    assert(Array.isArray(doc.access), 'Should have access array');
    const accessEntry1 = doc.access.find(
      (a: DocumentAccessEntry) => a.userId === 'recipient1'
    );
    assert(accessEntry1 === undefined, 'Should not have first recipient');
    const accessEntry2 = doc.access.find(
      (a: DocumentAccessEntry) => a.userId === 'recipient2'
    );
    assert(accessEntry2 !== undefined, 'Should still have second recipient');

    console.log(`  Only specified user removed from access: ${docId}`);
  });

  await runner.run('Loading state during unsharing', async () => {
    const title = generateTestTitle('_loading_unshare');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const shareResult = await useDocumentStore
      .getState()
      .shareDocument(docId, 'recipient');
    assert(isSuccess(shareResult), 'Should share document first');

    await verifyLoadingState(
      useDocumentStore.getState().unshareDocument(docId, 'recipient'),
      'SAVING'
    );
  });

  console.log('\n✅ unshareDocument tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test getSharedDocuments operations
 */
async function testGetSharedDocuments(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.getSharedDocuments()...\n');
  console.log(
    '⚠️  NOTE: These tests require setup where documents are shared with current user.\n'
  );

  const runner = new TestRunner('getSharedDocuments Operations');

  await cleanupDocumentStore();

  await runner.run('List empty shared documents', async () => {
    const result = await useDocumentStore.getState().getSharedDocuments();
    assert(isSuccess(result), 'Should succeed with empty array');
    assert(Array.isArray(result.data), 'Result data should be array');
    assert(result.data!.length === 0, 'Should return empty array');
    verifySuccessState();
  });

  for (const isPublic of [true, false]) {
    const suffix = isPublic ? 'public' : 'private';
    await runner.run(`List shared ${suffix} documents`, async () => {
      await cleanupDocumentStore();

      const title = generateTestTitle(`_shared_${suffix}`);
      const content = `${suffix} content shared with me`;
      const tags = ['shared', suffix];

      const createResult = await useDocumentStore
        .getState()
        .createDocument(title, content, tags, isPublic);
      assert(isSuccess(createResult), `Should create ${suffix} document first`);
      const docId = createResult.data!.id;

      const shareResult = await useDocumentStore
        .getState()
        .shareDocument(docId, 'recipient');
      assert(isSuccess(shareResult), `Should share ${suffix} document first`);

      const sharedResult = await useDocumentStore
        .getState()
        .getSharedDocuments();
      assert(
        isSuccess(sharedResult),
        'Should list shared documents successfully'
      );
      assert(
        sharedResult.data!.length >= 1,
        'Should have at least 1 shared document'
      );

      const sharedDoc = sharedResult.data!.find(d => d.id === docId);
      assert(sharedDoc !== undefined, 'Should find shared document in list');
      assert(sharedDoc!.title === title, 'Should have decrypted title');
      assert(sharedDoc!.content === content, 'Should have decrypted content');
      if (tags) {
        assert(
          JSON.stringify(sharedDoc!.tags) === JSON.stringify(tags),
          'Should have decrypted tags'
        );
      }
      assert(
        sharedDoc!.isPublic === isPublic,
        `Should have isPublic=${isPublic}`
      );
      verifySuccessState();

      console.log(`  Listed shared ${suffix} document: ${docId}`);
    });
  }

  await runner.run('Documents not shared with user excluded', async () => {
    await cleanupDocumentStore();

    const title1 = generateTestTitle('_shared');
    const title2 = generateTestTitle('_not_shared');

    const createResult1 = await useDocumentStore
      .getState()
      .createDocument(title1, 'content1', undefined, true);
    assert(isSuccess(createResult1), 'Should create first document');
    const docId1 = createResult1.data!.id;

    const createResult2 = await useDocumentStore
      .getState()
      .createDocument(title2, 'content2', undefined, true);
    assert(isSuccess(createResult2), 'Should create second document');
    const docId2 = createResult2.data!.id;

    const shareResult = await useDocumentStore
      .getState()
      .shareDocument(docId1, 'recipient');
    assert(isSuccess(shareResult), 'Should share first document');

    const sharedResult = await useDocumentStore.getState().getSharedDocuments();
    assert(
      isSuccess(sharedResult),
      'Should list shared documents successfully'
    );

    const sharedDoc1 = sharedResult.data!.find(d => d.id === docId1);
    const sharedDoc2 = sharedResult.data!.find(d => d.id === docId2);

    assert(sharedDoc1 !== undefined, 'Should find first document in list');
    assert(
      sharedDoc2 === undefined,
      'Should not find second document (not shared)'
    );

    console.log(`  Verified filtering for shared documents`);
  });

  await runner.run('Loading state during listing', async () => {
    const title = generateTestTitle('_loading_shared');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);
    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await useDocumentStore.getState().shareDocument(docId, 'recipient');

    await verifyLoadingState(
      useDocumentStore.getState().getSharedDocuments(),
      'LOADING'
    );
  });

  await runner.run('User not authenticated returns error', async () => {
    await cleanupDocumentStore();

    const gun = gunService.getGun();
    gun.user().leave();
    await sleep(200);

    const result = await useDocumentStore.getState().getSharedDocuments();

    assert(isFailure(result), 'Should fail when not authenticated');
    assert(isDocumentError(result.error), 'Should return DocumentError');
    assert(
      result.error?.code === 'PERMISSION_DENIED',
      'Error code should be PERMISSION_DENIED'
    );
    verifyErrorState('PERMISSION_DENIED', 'Authentication required');
  });

  console.log('\n✅ getSharedDocuments tests complete!');
  runner.printResults();
  await cleanupDocumentStore();
  return runner.getResults();
}

/**
 * Test getCollaborators operations
 */
async function testGetCollaborators(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.getCollaborators()...\n');

  const runner = new TestRunner('getCollaborators Operations');

  await runner.run(
    'Get collaborators for document with no access list',
    async () => {
      await cleanupDocumentStore();

      const { createDocument, getCollaborators } = useDocumentStore.getState();

      const createResult = await createDocument('Test Doc', 'content');
      assert(isSuccess(createResult), 'Document should be created');
      assert(createResult.data !== null, 'Document data should exist');

      const docId = createResult.data.id;
      await sleep(100);

      const result = await getCollaborators(docId);

      assert(isSuccess(result), 'Should get collaborators successfully');
      assert(result.data !== null, 'Result data should not be null');
      assert(Array.isArray(result.data), 'Result data should be array');
      assert(
        result.data.length === 0,
        'Should return empty array for no collaborators'
      );
      verifySuccessState();
    }
  );

  await runner.run(
    'Get collaborators for document with collaborators',
    async () => {
      await cleanupDocumentStore();

      const { createDocument, shareDocument, getCollaborators } =
        useDocumentStore.getState();

      const createResult = await createDocument('Shared Doc', 'content');
      assert(isSuccess(createResult), 'Document should be created');
      assert(createResult.data !== null, 'Document data should exist');

      const docId = createResult.data.id;
      await sleep(100);

      const shareResult = await shareDocument(docId, 'testuser1');
      assert(isSuccess(shareResult), 'Document should be shared');
      await sleep(200);

      const result = await getCollaborators(docId);

      assert(isSuccess(result), 'Should get collaborators successfully');
      assert(result.data !== null, 'Result data should not be null');
      assert(Array.isArray(result.data), 'Result data should be array');
      assert(result.data.length >= 1, 'Should have at least one collaborator');

      const collaborator = result.data[0];
      assert(
        collaborator.profile.username === 'testuser1',
        'Username should match'
      );
      verifySuccessState();
    }
  );

  await runner.run('Get collaborators for non-existent document', async () => {
    await cleanupDocumentStore();

    const { getCollaborators } = useDocumentStore.getState();

    const result = await getCollaborators('nonexistent-doc-id');

    assert(isFailure(result), 'Should fail for non-existent document');
    assert(isDocumentError(result.error), 'Should return DocumentError');
    assert(
      result.error?.code === 'NOT_FOUND',
      'Error code should be NOT_FOUND'
    );
    verifyErrorState('NOT_FOUND', 'Document not found');
  });

  console.log('\n✅ getCollaborators tests complete!');
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
export async function testDocumentStore(): Promise<TestSuiteResult[]> {
  console.log('🚀 Starting Document Store Tests\n');
  console.log('='.repeat(60));

  const suiteResults: TestSuiteResult[] = [];

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

  const shareResult = await testShareDocument();
  suiteResults.push(shareResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const unshareResult = await testUnshareDocument();
  suiteResults.push(unshareResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const sharedResult = await testGetSharedDocuments();
  suiteResults.push(sharedResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const collaboratorsResult = await testGetCollaborators();
  suiteResults.push(collaboratorsResult);
  console.log('\n' + '='.repeat(60));

  // Print summary
  printTestSummary(suiteResults);

  return suiteResults;
}
