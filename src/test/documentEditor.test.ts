/**
 * DocumentEditor Component Tests
 *
 * Tests for DocumentEditor component functionality.
 * Run from browser console using testRunner.
 *
 * Note: These tests verify component integration with documentStore.
 * Component rendering and user interaction require manual testing in browser.
 */

import { TestRunner } from '../utils/testRunner';
import { useDocumentStore } from '../stores/documentStore';
import { isSuccess, isFailure } from '../utils/functionalResult';

/**
 * Assert helper that works with browser tests
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Test DocumentEditor - component can be created with documentStore
 */
export async function testDocumentEditorCreation(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Component Creation', async () => {
    const { DocumentEditor } = await import('../components/DocumentEditor');

    assert(
      typeof DocumentEditor === 'function',
      'DocumentEditor should be exported as a function'
    );

    console.log('  📝 DocumentEditor component loaded successfully');
    console.log(
      '  📝 Manual testing required: Render component in browser and verify UI'
    );
  });
}

/**
 * Test DocumentEditor - documentStore methods are available
 */
export async function testDocumentEditorStoreMethods(
  runner: TestRunner
): Promise<void> {
  await runner.run(
    'DocumentEditor - DocumentStore Methods Available',
    async () => {
      const { createDocument, getDocument, updateDocument } =
        useDocumentStore.getState();

      assert(
        typeof createDocument === 'function',
        'createDocument should be available'
      );
      assert(
        typeof getDocument === 'function',
        'getDocument should be available'
      );
      assert(
        typeof updateDocument === 'function',
        'updateDocument should be available'
      );

      console.log('  📝 All required documentStore methods are available');
    }
  );
}

/**
 * Test DocumentEditor - new document creation flow
 */
export async function testDocumentEditorNewDocFlow(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - New Document Creation Flow', async () => {
    const { createDocument, clearError } = useDocumentStore.getState();

    clearError();

    const result = await createDocument(
      'Test Document',
      'Test content',
      ['tag1', 'tag2'],
      false
    );

    assert(isSuccess(result), 'Document should be created successfully');
    assert(result.data !== null, 'Document data should exist');
    assert(result.data?.title === 'Test Document', 'Title should match');
    assert(result.data?.content === 'Test content', 'Content should match');
    assert(result.data?.tags?.length === 2, 'Tags should be stored');

    const state = useDocumentStore.getState();
    assert(state.currentDocument !== null, 'currentDocument should be set');
    assert(
      state.currentDocument?.title === 'Test Document',
      'Current document should match'
    );

    console.log('  📝 New document creation flow works correctly');
    console.log(
      '  📝 Manual testing required: Verify component UI for new document creation'
    );

    await cleanup();
  });
}

/**
 * Test DocumentEditor - update existing document flow
 */
export async function testDocumentEditorUpdateDocFlow(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Update Document Flow', async () => {
    const { createDocument, updateDocument, clearError } =
      useDocumentStore.getState();

    clearError();

    const createResult = await createDocument(
      'Original Title',
      'Original content'
    );

    assert(isSuccess(createResult), 'Document should be created successfully');
    assert(createResult.data !== null, 'Document data should exist');

    const docId = createResult.data?.id;
    assert(docId !== null, 'Document should have an id');

    const updateResult = await updateDocument(docId, {
      title: 'Updated Title',
    });

    assert(isSuccess(updateResult), 'Document should be updated successfully');

    const getResult = await useDocumentStore.getState().getDocument(docId);
    assert(isSuccess(getResult), 'Document should be retrieved successfully');
    assert(
      getResult.data?.title === 'Updated Title',
      'Title should be updated'
    );

    console.log('  📝 Update document flow works correctly');
    console.log(
      '  📝 Manual testing required: Verify component UI for document editing'
    );

    await cleanup();
  });
}

/**
 * Test DocumentEditor - public document creation
 */
export async function testDocumentEditorPublicDoc(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Public Document Creation', async () => {
    const { createDocument, clearError } = useDocumentStore.getState();

    clearError();

    const result = await createDocument(
      'Public Doc',
      'Public content',
      [],
      true
    );

    assert(isSuccess(result), 'Public document should be created successfully');
    assert(result.data !== null, 'Document data should exist');
    assert(
      result.data?.isPublic === true,
      'Document should be marked as public'
    );

    console.log('  📝 Public document creation works correctly');
    console.log(
      '  📝 Manual testing required: Verify public checkbox in component UI'
    );

    await cleanup();
  });
}

/**
 * Test DocumentEditor - tags handling
 */
export async function testDocumentEditorTags(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Tags Handling', async () => {
    const { createDocument, clearError } = useDocumentStore.getState();

    clearError();

    const result = await createDocument(
      'Tagged Document',
      'Content with tags',
      ['tag1', 'tag2', 'tag3']
    );

    assert(
      isSuccess(result),
      'Document with tags should be created successfully'
    );
    assert(result.data !== null, 'Document data should exist');
    assert(result.data?.tags?.length === 3, 'All tags should be stored');
    assert(result.data?.tags?.includes('tag1'), 'Tag1 should be present');
    assert(result.data?.tags?.includes('tag2'), 'Tag2 should be present');
    assert(result.data?.tags?.includes('tag3'), 'Tag3 should be present');

    console.log('  📝 Tags handling works correctly');
    console.log(
      '  📝 Manual testing required: Verify tags input in component UI'
    );

    await cleanup();
  });
}

/**
 * Test DocumentEditor - validation errors
 */
export async function testDocumentEditorValidation(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Validation Errors', async () => {
    const { createDocument, clearError } = useDocumentStore.getState();

    clearError();

    const result = await createDocument('', 'Content without title');

    assert(isFailure(result), 'Empty title should fail validation');
    assert(
      result.error?.code === 'VALIDATION_ERROR',
      'Error code should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Title is required',
      'Error message should match'
    );

    const state = useDocumentStore.getState();
    assert(state.error === 'Title is required', 'Error should be set in state');

    console.log('  📝 Validation errors work correctly');
    console.log(
      '  📝 Manual testing required: Verify error display in component UI'
    );

    await cleanup();
  });
}

/**
 * Test DocumentEditor - loading states
 */
export async function testDocumentEditorLoadingStates(
  runner: TestRunner
): Promise<void> {
  await runner.run('DocumentEditor - Loading States', async () => {
    const { getDocument, clearError } = useDocumentStore.getState();

    clearError();

    const resultPromise = getDocument('nonexistent-doc-id');
    const state = useDocumentStore.getState();

    assert(
      state.status === 'LOADING',
      'Status should be LOADING during operation'
    );

    await resultPromise;

    const finalState = useDocumentStore.getState();
    assert(
      finalState.status === 'READY',
      'Status should be READY after operation completes'
    );

    console.log('  📝 Loading states work correctly');
    console.log(
      '  📝 Manual testing required: Verify loading indicators in component UI'
    );

    await cleanup();
  });
}

/**
 * Cleanup function to reset state
 */
function cleanup(): void {
  useDocumentStore.setState({
    currentDocument: null,
    documentList: [],
    status: 'READY',
    error: null,
  });
}

/**
 * Run all DocumentEditor tests
 */
export async function runDocumentEditorTests(
  runner: TestRunner
): Promise<void> {
  console.log('Starting DocumentEditor component tests...');

  await testDocumentEditorCreation(runner);
  await testDocumentEditorStoreMethods(runner);
  await testDocumentEditorNewDocFlow(runner);
  await testDocumentEditorUpdateDocFlow(runner);
  await testDocumentEditorPublicDoc(runner);
  await testDocumentEditorTags(runner);
  await testDocumentEditorValidation(runner);
  await testDocumentEditorLoadingStates(runner);

  console.log('DocumentEditor component tests completed!');
  console.log('\n📝 Manual browser testing required for:');
  console.log('  - Component rendering and UI');
  console.log('  - User interactions (typing, clicking)');
  console.log('  - Error message display');
  console.log('  - Loading and saving indicators');
  console.log('  - Cancel/Close functionality');
}
