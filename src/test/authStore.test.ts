/**
 * Auth Store Browser Tests
 *
 * Tests for authentication state management that can be run from the browser console.
 *
 * IMPORTANT: Dual Error Handling Pattern
 * --------------------------------------
 * authStore methods use a dual error handling approach:
 *
 * 1. Thrown Errors: AuthError objects with structure:
 *    { type: string, message: string, originalError?: unknown }
 *
 * 2. Store State: User-friendly messages in state.error (string | null)
 *
 * Tests should verify BOTH:
 * - Thrown AuthError objects have correct type and originalError
 * - Store state contains user-friendly messages for UI display
 */

import { useAuthStore } from '../stores/authStore';
import { gunService } from '../services/gunService';
import { TestRunner, type TestSuiteResult, sleep } from '../utils/testRunner';
import { tryCatch, isFailure } from '../utils/functionalResult';
import type { AuthError } from '../stores/authStore';

/**
 * Cleanup authStore state between tests
 */
async function cleanupAuthStore(): Promise<void> {
  const { logout, clearError } = useAuthStore.getState();
  logout();
  clearError();

  // Wait a bit for GunDB operations to complete
  await sleep(500);
}

/**
 * Generate unique test username
 */
function generateTestUsername(suffix: string = ''): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}${suffix}`;
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
 * Type guard to check if error is AuthError
 */
function isAuthError(error: unknown): error is AuthError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    'type' in error &&
    typeof error.type === 'string'
  );
}

/**
 * Test input validation
 */
async function testInputValidation(runner: TestRunner): Promise<void> {
  await runner.run('Register with empty username', async () => {
    const result = await tryCatch(async () =>
      useAuthStore.getState().register('', 'password123')
    );
    assert(isFailure(result), 'Should fail with empty username');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'VALIDATION_ERROR',
      'Error type should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Username is required',
      'Error message should match exactly'
    );
  });

  await runner.run('Register with short password', async () => {
    const result = await tryCatch(async () =>
      useAuthStore.getState().register('user', '123')
    );
    assert(isFailure(result), 'Should fail with short password');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'VALIDATION_ERROR',
      'Error type should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Password must be at least 6 characters',
      'Error message should match exactly'
    );
  });

  await runner.run('Login with empty username', async () => {
    const result = await tryCatch(async () =>
      useAuthStore.getState().login('', 'password123')
    );
    assert(isFailure(result), 'Should fail with empty username');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'VALIDATION_ERROR',
      'Error type should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Username is required',
      'Error message should match exactly'
    );
  });

  await runner.run('Login with empty password', async () => {
    const result = await tryCatch(async () =>
      useAuthStore.getState().login('user', '')
    );
    assert(isFailure(result), 'Should fail with empty password');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'VALIDATION_ERROR',
      'Error type should be VALIDATION_ERROR'
    );
    assert(
      result.error?.message === 'Password must be at least 6 characters',
      'Error message should match exactly'
    );
  });
}

/**
 * Test basic operations
 */
async function testBasicOperations(runner: TestRunner): Promise<void> {
  await runner.run('Login after logout should not error', async () => {
    const username = generateTestUsername('_auth_regression');
    const password = 'testpass123';

    const registerResult = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, password)
    );
    if (isFailure(registerResult)) {
      throw registerResult.error;
    }

    useAuthStore.getState().logout();

    const loginResult = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().login(username, password)
    );
    assert(
      !isFailure(loginResult),
      `Login should not error: ${isFailure(loginResult) ? loginResult.error.message : 'none'}`
    );

    const { user, isAuthenticated } = useAuthStore.getState();
    assert(isAuthenticated, 'Should be authenticated');
    assert(user !== null, 'Should have user object');

    const gun = gunService.getGun();
    assert(gun !== null, 'GunDB should be initialized');
    const gunUser = gun.user();
    assert(gunUser.is !== undefined, 'Gun user should be set');
    assert(gunUser.is?.pub !== undefined, 'User should have pub key');

    console.log(
      `  Authenticated successfully: ${gunUser.is.pub.substring(0, 20)}...`
    );
  });

  await runner.run('Duplicate registration should error', async () => {
    const username = generateTestUsername('_creation_regression');
    const password = 'testpass123';

    const registerResult = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, password)
    );
    assert(registerResult.success, JSON.stringify(registerResult));

    const { user, isAuthenticated } = useAuthStore.getState();
    assert(isAuthenticated, 'Should be authenticated');
    assert(user !== null, 'Should have user object');

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, password)
    );

    assert(isFailure(result), 'Should error when creating existing user');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Error type should be USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly message; observed: ${result.error?.message || 'unknown error'}`
    );

    const state = useAuthStore.getState();
    assert(
      state.error ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly error message; observed: ${state.error}`
    );

    console.log(`  User creation correctly rejected existing user`);
  });

  await runner.run('Duplicate registration should error', async () => {
    const username = generateTestUsername('_creation_regression');
    const password = 'testpass123';

    const registerResult = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, password)
    );
    assert(registerResult.success, JSON.stringify(registerResult));

    const { user, isAuthenticated } = useAuthStore.getState();
    assert(isAuthenticated, 'Should be authenticated');
    assert(user !== null, 'Should have user object');

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, password)
    );

    assert(isFailure(result), 'Should error when creating existing user');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Error type should be USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly message; observed: ${result.error?.message || 'unknown error'}`
    );

    const state = useAuthStore.getState();
    assert(
      state.error ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly error message; observed: ${state.error}`
    );

    console.log(`  User creation correctly rejected existing user`);
  });

  await runner.run('Duplicate registration should error', async () => {
    const username = generateTestUsername('_creation_regression');
    const password = 'testpass123';

    const registerResult = await tryCatch(() =>
      useAuthStore.getState().register(username, password)
    );
    assert(registerResult.success, JSON.stringify(registerResult));

    const { user, isAuthenticated } = useAuthStore.getState();
    assert(isAuthenticated, 'Should be authenticated');
    assert(user !== null, 'Should have user object');

    const result = await tryCatch(() =>
      useAuthStore.getState().register(username, password)
    );

    assert(isFailure(result), 'Should error when creating existing user');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Error type should be USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly message; observed: ${result.error?.message || 'unknown error'}`
    );

    const state = useAuthStore.getState();
    assert(
      state.error ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly error message; observed: ${state.error}`
    );

    console.log(`  User creation correctly rejected existing user`);
  });

  await runner.run('Duplicate registration should error', async () => {
    const username = generateTestUsername('_creation_regression');
    const password = 'testpass123';

    const registerResult = await tryCatch(async () =>
      useAuthStore.getState().register(username, password)
    );
    assert(registerResult.success, JSON.stringify(registerResult));

    const { user, isAuthenticated } = useAuthStore.getState();
    assert(isAuthenticated, 'Should be authenticated');
    assert(user !== null, 'Should have user object');

    const result = await tryCatch(async () =>
      useAuthStore.getState().register(username, password)
    );

    assert(isFailure(result), 'Should error when creating existing user');
    assert(isAuthError(result.error), 'Should throw AuthError object');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Error type should be USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly message; observed: ${result.error?.message || 'unknown error'}`
    );

    const state = useAuthStore.getState();
    assert(
      state.error ===
        'Could not create account. Username may already be taken.',
      `Should show user-friendly error message; observed: ${state.error}`
    );

    console.log(`  User creation correctly rejected existing user`);
  });

  await runner.run('Logout clears state properly', async () => {
    const username = generateTestUsername('_logout');
    await useAuthStore.getState().register(username, 'password123');

    // Verify authenticated state
    const authState = useAuthStore.getState();
    assert(authState.isAuthenticated, 'Should be authenticated before logout');
    assert(authState.user !== null, 'Should have user before logout');

    // Logout
    useAuthStore.getState().logout();

    // Verify cleared state
    const loggedOutState = useAuthStore.getState();
    assert(
      !loggedOutState.isAuthenticated,
      'Should not be authenticated after logout'
    );
    assert(loggedOutState.user === null, 'Should have no user after logout');
    assert(loggedOutState.error === null, 'Should have no error after logout');
  });

  await runner.run('Clear error works correctly', async () => {
    await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register('', '')
    );
    let state = useAuthStore.getState();
    assert(state.error !== null, 'Should have error after failed validation');

    useAuthStore.getState().clearError();
    state = useAuthStore.getState();
    assert(state.error === null, 'Should have no error after clearError');
  });
}

/**
 * Test state transitions during authentication operations
 */
async function testStateTransitions(runner: TestRunner): Promise<void> {
  await runner.run('Loading state during register', async () => {
    const username = generateTestUsername('_loading');

    const initialState = useAuthStore.getState();
    assert(!initialState.isLoading, 'Should not be loading initially');

    const registerPromise = useAuthStore
      .getState()
      .register(username, 'password123');
    const loadingState = useAuthStore.getState();
    assert(loadingState.isLoading, 'Should be loading during register');

    await registerPromise;
    const finalState = useAuthStore.getState();
    assert(!finalState.isLoading, 'Should not be loading after success');
    assert(finalState.isAuthenticated, 'Should be authenticated after success');
    assert(finalState.error === null, 'Should have no error after success');
  });

  await runner.run('State cleanup on register failure', async () => {
    const username = generateTestUsername('_cleanup');
    await useAuthStore.getState().register(username, 'password123');
    await useAuthStore.getState().logout();

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, 'password123')
    );
    const finalState = useAuthStore.getState();

    assert(isFailure(result), 'Should fail to register existing user');
    assert(!finalState.isLoading, 'Should not be loading after failure');
    assert(
      !finalState.isAuthenticated,
      'Should not be authenticated after failure'
    );
    assert(finalState.error !== null, 'Should have error message');
  });
}

/**
 * Test error handling for various scenarios
 */
async function testErrorHandling(runner: TestRunner): Promise<void> {
  await runner.run('User creation error shows friendly message', async () => {
    const username = generateTestUsername('_friendly');
    await useAuthStore.getState().register(username, 'password123');
    await useAuthStore.getState().logout();

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, 'password123')
    );
    const state = useAuthStore.getState();

    assert(isFailure(result), 'Should fail when registering existing user');
    assert(isAuthError(result.error), 'Error should be AuthError type');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Error type should be USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      'Error message should be user-friendly'
    );
    assert(
      result.error?.originalError instanceof Error,
      'Original error should be preserved as Error instance'
    );
    if (result.error?.originalError instanceof Error) {
      assert(
        result.error.originalError.message.includes('User creation failed'),
        'Original error should contain gunService message'
      );
    }

    assert(
      state.error ===
        'Could not create account. Username may already be taken.',
      'Should show user-friendly error for existing username'
    );
  });

  await runner.run(
    'Unexpected errors show validation hint not modal',
    async () => {
      const username = generateTestUsername('_unexpected');

      const result = await tryCatch<void, AuthError>(() =>
        useAuthStore.getState().register(username, '')
      );
      assert(isFailure(result), 'Should fail with validation error');
      assert(
        result.error?.message === 'Password must be at least 6 characters',
        'Should show validation error for empty password'
      );

      const state = useAuthStore.getState();
      assert(
        state.error === 'Password must be at least 6 characters',
        'Should have validation error in state'
      );
    }
  );
}

/**
 * Test session management functionality
 */
async function testSessionManagement(runner: TestRunner): Promise<void> {
  await runner.run('Session persistence after register', async () => {
    const username = generateTestUsername('_session');
    await useAuthStore.getState().register(username, 'password123');

    // Simulate page refresh by checking session
    await useAuthStore.getState().checkSession();

    const state = useAuthStore.getState();
    assert(
      state.isAuthenticated,
      'Should maintain authentication after session check'
    );
    assert(state.user !== null, 'Should have user object after session check');
  });

  await runner.run('Session check with no existing session', async () => {
    // Ensure we're logged out first
    useAuthStore.getState().logout();

    await useAuthStore.getState().checkSession();
    const state = useAuthStore.getState();

    assert(
      !state.isAuthenticated,
      'Should not be authenticated when no session exists'
    );
    assert(state.user === null, 'Should have no user when no session exists');
    assert(!state.isLoading, 'Should not be loading after session check');
  });
}

/**
 * Test error transformation from various error types
 */
async function testErrorTransformation(runner: TestRunner): Promise<void> {
  await runner.run('Transform USER_EXISTS error from gunService', async () => {
    const username = generateTestUsername('_transform_user_exists');
    await useAuthStore.getState().register(username, 'password123');
    await useAuthStore.getState().logout();

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, 'password123')
    );

    assert(isFailure(result), 'Should fail when registering existing user');
    assert(isAuthError(result.error), 'Error should be AuthError type');
    assert(
      result.error?.type === 'USER_EXISTS',
      'Should transform to USER_EXISTS'
    );
    assert(
      result.error?.message ===
        'Could not create account. Username may already be taken.',
      'Should show user-friendly message'
    );
    assert(
      result.error?.originalError instanceof Error,
      'Original error should be preserved'
    );
  });

  await runner.run('Transform AUTH_FAILED error', async () => {
    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore
        .getState()
        .login(generateTestUsername('_nonexistent'), 'wrongpass')
    );

    assert(isFailure(result), 'Should fail with authentication error');
    assert(isAuthError(result.error), 'Error should be AuthError type');
    assert(result.error?.type === 'AUTH_FAILED', 'Should be AUTH_FAILED type');
    assert(
      result.error?.message === 'Invalid username or password',
      'Should show user-friendly message'
    );
  });

  await runner.run('Transform VALIDATION_ERROR', async () => {
    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register('', 'password123')
    );

    assert(isFailure(result), 'Should fail with validation error');
    assert(isAuthError(result.error), 'Error should be AuthError type');
    assert(
      result.error?.type === 'VALIDATION_ERROR',
      'Should be VALIDATION_ERROR type'
    );
    assert(
      result.error?.message === 'Username is required',
      'Should show validation error'
    );
  });

  await runner.run('Original error is preserved in AuthError', async () => {
    const username = generateTestUsername('_original_error');
    await useAuthStore.getState().register(username, 'password123');
    await useAuthStore.getState().logout();

    const result = await tryCatch<void, AuthError>(() =>
      useAuthStore.getState().register(username, 'password123')
    );

    assert(isFailure(result), 'Should fail when registering existing user');
    assert(isAuthError(result.error), 'Error should be AuthError type');
    assert(
      result.error?.originalError !== undefined,
      'Original error should be preserved'
    );

    if (result.error?.originalError instanceof Error) {
      assert(
        result.error.originalError.message.includes('User creation failed'),
        'Original error should contain gunService message'
      );
    }
  });
}

/**
 * Test session timeout behavior
 */
async function testSessionTimeout(runner: TestRunner): Promise<void> {
  await runner.run('Session check handles timeout gracefully', async () => {
    await cleanupAuthStore();

    const initialState = useAuthStore.getState();
    assert(!initialState.isLoading, 'Should not be loading initially');
    assert(
      !initialState.isAuthenticated,
      'Should not be authenticated before test'
    );
    assert(initialState.user === null, 'Should have no user before test');

    const checkPromise = useAuthStore.getState().checkSession();

    await checkPromise;
    const finalState = useAuthStore.getState();
    assert(!finalState.isLoading, 'Should not be loading after session check');
    assert(finalState.error === null, 'Should not have error after timeout');
  });
}

/**
 * Run all AuthStore tests
 */
export async function testAuthStore(): Promise<TestSuiteResult> {
  console.log('🧪 Testing AuthStore...\n');
  console.log('='.repeat(60));

  // Pre-test cleanup
  await cleanupAuthStore();

  const runner = new TestRunner('AuthStore');

  // Run all test suites
  await testInputValidation(runner);
  await testBasicOperations(runner);
  await testStateTransitions(runner);
  await testErrorHandling(runner);
  await testSessionManagement(runner);
  await testErrorTransformation(runner);
  await testSessionTimeout(runner);

  console.log('\n✅ AuthStore tests complete!');
  runner.printResults();

  // Post-test cleanup
  await cleanupAuthStore();

  return runner.getResults();
}
