/**
 * Document Store Browser Tests - createDocument()
 *
 * Tests for document creation that can be run from browser console.
 *
 * IMPORTANT: Error Handling Pattern
 * --------------------------------
 * documentStore methods return Result<Document, DocumentError> objects.
 *
 * Tests should verify:
 * - Result.success is true/false based on operation outcome
 * - Result.data contains the created Document on success
 * - Result.error contains DocumentError with proper code and message on failure
 * - Store state is updated correctly (currentDocument, status, error)
 */

import { useDocumentStore } from '../stores/documentStore';
import { useAuthStore } from '../stores/authStore';
import { TestRunner, type TestSuiteResult, sleep } from '../utils/testRunner';
import { isFailure, isSuccess } from '../utils/functionalResult';
import type { DocumentError, MinimalDocListItem } from '../types/document';
import { gunService } from '../services/gunService';

/**
 * Cleanup documentStore state between tests
 */
async function cleanupDocumentStore(): Promise<void> {
  const { currentDocument, documentList } = useDocumentStore.getState();

  // Note: We can't delete documents without getDocument implemented
  // So we just clear state for now
  useDocumentStore.setState({
    currentDocument: null,
    documentList: [],
    status: 'READY',
    error: null,
  });

  await sleep(100);
}

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
 * Test input validation for createDocument
 */
async function testInputValidation(runner: TestRunner): Promise<void> {
  await runner.run('Create document with empty title', async () => {
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

    const state = useDocumentStore.getState();
    assert(state.currentDocument === null, 'Should not set currentDocument');
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === 'Title is required', 'State error should match');
  });

  await runner.run('Create document with null content', async () => {
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

  await runner.run('Create document with undefined content', async () => {
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
}

/**
 * Test basic createDocument operations
 */
async function testBasicOperations(runner: TestRunner): Promise<void> {
  await runner.run('Create public document successfully', async () => {
    const title = generateTestTitle('_public');
    const content = 'Test content';
    const tags = ['tag1', 'tag2'];

    const result = await useDocumentStore.getState().createDocument(
      title,
      content,
      tags,
      true // isPublic
    );

    assert(isSuccess(result), 'Should succeed creating public document');
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    assert(typeof doc.id === 'string', 'Document should have id');
    assert(doc.id.length > 0, 'Document id should not be empty');
    assert(doc.title === title, 'Title should match (not encrypted)');
    assert(doc.content === content, 'Content should match (not encrypted)');
    assert(
      JSON.stringify(doc.tags) === JSON.stringify(tags),
      'Tags should match (not encrypted)'
    );
    assert(doc.isPublic === true, 'isPublic should be true');
    assert(doc.createdAt > 0, 'Should have createdAt timestamp');
    assert(doc.updatedAt > 0, 'Should have updatedAt timestamp');
    assert(Array.isArray(doc.access), 'Should have access array');
    assert(doc.access.length === 0, 'Access array should be empty');

    const state = useDocumentStore.getState();
    assert(state.currentDocument?.id === doc.id, 'Should set currentDocument');
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error');

    console.log(`  Created public document: ${doc.id}`);
  });

  await runner.run('Create private document successfully', async () => {
    const title = generateTestTitle('_private');
    const content = 'Secret content';

    const result = await useDocumentStore.getState().createDocument(
      title,
      content,
      undefined,
      false // isPublic (default)
    );

    assert(isSuccess(result), 'Should succeed creating private document');
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    assert(typeof doc.id === 'string', 'Document should have id');
    assert(
      doc.title !== title,
      'Title should be encrypted (different from input)'
    );
    assert(
      doc.content !== content,
      'Content should be encrypted (different from input)'
    );
    assert(doc.isPublic === false, 'isPublic should be false');

    const state = useDocumentStore.getState();
    assert(state.currentDocument?.id === doc.id, 'Should set currentDocument');
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error');

    console.log(`  Created private document: ${doc.id}`);
  });

  await runner.run('Create document with no tags', async () => {
    const title = generateTestTitle('_no_tags');
    const content = 'Test content';

    const result = await useDocumentStore
      .getState()
      .createDocument(title, content);

    assert(isSuccess(result), 'Should succeed creating document without tags');
    assert(result.data !== undefined, 'Should have document data');

    const doc = result.data!;
    assert(doc.tags === undefined, 'Tags should be undefined');

    console.log(`  Created document without tags: ${doc.id}`);
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
    assert(Array.isArray(doc.tags), 'Tags should be an array');
    assert(doc.tags.length === 0, 'Tags array should be empty');

    console.log(`  Created document with empty tags: ${doc.id}`);
  });
}

/**
 * Test state transitions during createDocument
 */
async function testStateTransitions(runner: TestRunner): Promise<void> {
  await runner.run('Loading state during creation', async () => {
    const title = generateTestTitle('_loading');

    const initialState = useDocumentStore.getState();
    assert(initialState.status === 'READY', 'Should not be loading initially');

    const createPromise = useDocumentStore
      .getState()
      .createDocument(title, 'content');

    const loadingState = useDocumentStore.getState();
    assert(
      loadingState.status === 'LOADING',
      'Should be loading during creation'
    );

    await createPromise;

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Should not be loading after success'
    );
    assert(finalState.error === null, 'Should have no error after success');
    assert(finalState.currentDocument !== null, 'Should have currentDocument');
  });

  await runner.run('State cleanup on validation failure', async () => {
    const initialState = useDocumentStore.getState();
    assert(initialState.status === 'READY', 'Should not be loading initially');

    await useDocumentStore.getState().createDocument('', 'content');

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Should not be loading after failure'
    );
    assert(finalState.error !== null, 'Should have error message');
    assert(
      finalState.currentDocument === null,
      'Should not set currentDocument'
    );
  });
}

/**
 * Test document properties
 */
async function testDocumentProperties(runner: TestRunner): Promise<void> {
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
    assert(
      doc.createdAt >= beforeCreation,
      `createdAt (${doc.createdAt}) should be >= before (${beforeCreation})`
    );
    assert(
      doc.createdAt <= afterCreation,
      `createdAt (${doc.createdAt}) should be <= after (${afterCreation})`
    );
    assert(
      doc.updatedAt >= beforeCreation,
      `updatedAt (${doc.updatedAt}) should be >= before (${beforeCreation})`
    );
    assert(
      doc.updatedAt <= afterCreation,
      `updatedAt (${doc.updatedAt}) should be <= after (${afterCreation})`
    );
    assert(
      doc.updatedAt === doc.createdAt,
      'updatedAt should equal createdAt initially'
    );

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
}

/**
 * Run all createDocument tests
 */
export async function testCreateDocument(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.createDocument()...\n');
  console.log('='.repeat(60));

  // Pre-test cleanup
  await cleanupDocumentStore();

  const runner = new TestRunner('documentStore.createDocument');

  // Run all test suites
  await testInputValidation(runner);
  await testBasicOperations(runner);
  await testStateTransitions(runner);
  await testDocumentProperties(runner);

  console.log('\n✅ createDocument tests complete!');
  runner.printResults();

  // Post-test cleanup
  await cleanupDocumentStore();

  return runner.getResults();
}

/**
 * Test getDocument operations
 */
async function testGetDocument(runner: TestRunner): Promise<void> {
  await runner.run('Get existing public document', async () => {
    const title = generateTestTitle('_get_public');
    const content = 'Public content to retrieve';
    const tags = ['public', 'test'];

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, tags, true);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await cleanupDocumentStore();

    const getResult = await useDocumentStore.getState().getDocument(docId);

    assert(isSuccess(getResult), 'Should retrieve existing document');
    assert(getResult.data !== null, 'Should return document (not null)');
    assert(getResult.data!.id === docId, 'Should have matching id');
    assert(
      getResult.data!.title === title,
      'Should have original title (not encrypted)'
    );
    assert(
      getResult.data!.content === content,
      'Should have original content (not encrypted)'
    );
    assert(
      JSON.stringify(getResult.data!.tags) === JSON.stringify(tags),
      'Should have original tags (not encrypted)'
    );
    assert(getResult.data!.isPublic === true, 'Should have isPublic=true');

    const state = useDocumentStore.getState();
    assert(state.currentDocument?.id === docId, 'Should set currentDocument');
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error');

    console.log(`  Retrieved public document: ${docId}`);
  });

  await runner.run('Get existing private document', async () => {
    const title = generateTestTitle('_get_private');
    const content = 'Private content to retrieve';
    const tags = ['private', 'secret'];

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, tags, false);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    await cleanupDocumentStore();

    const getResult = await useDocumentStore.getState().getDocument(docId);

    assert(isSuccess(getResult), 'Should retrieve existing document');
    assert(getResult.data !== null, 'Should return document (not null)');
    assert(getResult.data!.id === docId, 'Should have matching id');
    assert(getResult.data!.title === title, 'Should have decrypted title');
    assert(
      getResult.data!.content === content,
      'Should have decrypted content'
    );
    assert(
      JSON.stringify(getResult.data!.tags) === JSON.stringify(tags),
      'Should have decrypted tags'
    );
    assert(getResult.data!.isPublic === false, 'Should have isPublic=false');

    const state = useDocumentStore.getState();
    assert(state.currentDocument?.id === docId, 'Should set currentDocument');
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error');

    console.log(`  Retrieved private document: ${docId}`);
  });

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

      const state = useDocumentStore.getState();
      assert(state.currentDocument === null, 'Should not set currentDocument');
      assert(state.status === 'READY', 'Status should be READY');
      assert(state.error === null, 'Should have no error');

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

    const initialState = useDocumentStore.getState();
    assert(initialState.status === 'READY', 'Should not be loading initially');

    const getPromise = useDocumentStore.getState().getDocument(docId);

    const loadingState = useDocumentStore.getState();
    assert(
      loadingState.status === 'LOADING',
      'Should be loading during retrieval'
    );

    await getPromise;

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Should not be loading after success'
    );
    assert(finalState.error === null, 'Should have no error after success');
    assert(finalState.currentDocument !== null, 'Should have currentDocument');
  });
}

/**
 * Run all getDocument tests
 */
export async function testGetDocumentSuite(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.getDocument()...\n');
  console.log('='.repeat(60));

  const runner = new TestRunner('documentStore.getDocument');

  await testGetDocument(runner);

  console.log('\n✅ getDocument tests complete!');
  runner.printResults();

  await cleanupDocumentStore();

  return runner.getResults();
}

/**
 * Test deleteDocument operations
 */
async function testDeleteDocument(runner: TestRunner): Promise<void> {
  await runner.run('Delete existing public document', async () => {
    const title = generateTestTitle('_delete_public');
    const content = 'Public content to delete';

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, undefined, true);

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

    const state = useDocumentStore.getState();
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error');
    assert(
      state.currentDocument === null,
      'Should clear currentDocument if deleted'
    );

    console.log(`  Deleted public document: ${docId}`);
  });

  await runner.run('Delete existing private document', async () => {
    const title = generateTestTitle('_delete_private');
    const content = 'Private content to delete';

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, content, undefined, false);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const deleteResult = await useDocumentStore
      .getState()
      .deleteDocument(docId);

    assert(isSuccess(deleteResult), 'Should delete private document');
    assert(deleteResult.data === undefined, 'Should return void (undefined)');

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assert(isSuccess(getResult), 'getDocument should not throw error');
    assert(
      getResult.data === null,
      'getDocument should return null after deletion'
    );

    console.log(`  Deleted private document: ${docId}`);
  });

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

    const state = useDocumentStore.getState();
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error !== null, 'Should have error message');

    console.log(`  Non-existent document handled correctly: ${fakeDocId}`);
  });

  await runner.run('State cleanup on deletion', async () => {
    const title = generateTestTitle('_state_cleanup');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const initialState = useDocumentStore.getState();
    assert(
      initialState.currentDocument?.id === docId,
      'Should have document in currentDocument'
    );

    await useDocumentStore.getState().deleteDocument(docId);

    const finalState = useDocumentStore.getState();
    assert(finalState.currentDocument === null, 'Should clear currentDocument');
    assert(finalState.status === 'READY', 'Status should be READY');
    assert(finalState.error === null, 'Should have no error after success');
  });

  await runner.run('Document removed from documentList', async () => {
    const title = generateTestTitle('_list_removal');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const stateBefore = useDocumentStore.getState();
    const listBefore = stateBefore.documentList;
    const itemBefore = listBefore.find(item => item.docId === docId);

    await useDocumentStore.getState().deleteDocument(docId);

    const stateAfter = useDocumentStore.getState();
    const listAfter = stateAfter.documentList;
    const itemAfter = listAfter.find(item => item.docId === docId);

    assert(itemAfter === undefined, 'Document should be removed from list');
  });

  await runner.run('Loading state during deletion', async () => {
    const title = generateTestTitle('_loading_delete');

    const createResult = await useDocumentStore
      .getState()
      .createDocument(title, 'content', undefined, true);

    assert(isSuccess(createResult), 'Should create document first');
    const docId = createResult.data!.id;

    const initialState = useDocumentStore.getState();
    assert(initialState.status === 'READY', 'Should not be loading initially');

    const deletePromise = useDocumentStore.getState().deleteDocument(docId);

    const loadingState = useDocumentStore.getState();
    assert(
      loadingState.status === 'LOADING',
      'Should be loading during deletion'
    );

    await deletePromise;

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Should not be loading after success'
    );
    assert(finalState.error === null, 'Should have no error after success');
  });
}

/**
 * Run all deleteDocument tests
 */
export async function testDeleteDocumentSuite(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.deleteDocument()...\n');
  console.log('='.repeat(60));

  const runner = new TestRunner('documentStore.deleteDocument');

  await testDeleteDocument(runner);

  console.log('\n✅ deleteDocument tests complete!');
  runner.printResults();

  await cleanupDocumentStore();

  return runner.getResults();
}

/**
 * Test listDocuments
 */
async function testListDocuments(runner: TestRunner): Promise<void> {
  await runner.run('List empty documents', async () => {
    await cleanupDocumentStore();

    const result = await useDocumentStore.getState().listDocuments();

    assert(isSuccess(result), 'Should succeed with empty list');
    assert(Array.isArray(result.data), 'Result data should be array');
    assert(result.data!.length === 0, 'Should return empty array');

    const state = useDocumentStore.getState();
    assert(
      state.documentList.length === 0,
      'State documentList should be empty'
    );
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error after success');
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

    const state = useDocumentStore.getState();
    assert(
      state.documentList.length >= 2,
      'State documentList should have at least 2 documents'
    );
    assert(state.status === 'READY', 'Status should be READY');
    assert(state.error === null, 'Should have no error after success');

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
    await cleanupDocumentStore();

    const initialState = useDocumentStore.getState();
    assert(initialState.status === 'READY', 'Should not be loading initially');

    const listPromise = useDocumentStore.getState().listDocuments();

    const loadingState = useDocumentStore.getState();
    assert(
      loadingState.status === 'LOADING',
      'Should be loading during listing'
    );

    await listPromise;

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Should not be loading after success'
    );
    assert(finalState.error === null, 'Should have no error after success');
  });
}

/**
 * Run all listDocuments tests
 */
export async function testListDocumentsSuite(): Promise<TestSuiteResult> {
  console.log('🧪 Testing documentStore.listDocuments()...\n');
  console.log('='.repeat(60));

  const runner = new TestRunner('documentStore.listDocuments');

  await testListDocuments(runner);

  console.log('\n✅ listDocuments tests complete!');
  runner.printResults();

  await cleanupDocumentStore();

  return runner.getResults();
}
