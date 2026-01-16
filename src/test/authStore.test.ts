/**
 * Auth Store Browser Tests
 *
 * Tests for authentication state management that can be run from the browser console.
 * This follows the established TestRunner pattern from gunService.test.ts.
 */

import { useAuthStore } from '../stores/authStore'
import { gunService } from '../services/gunService'
import { TestRunner, type TestSuiteResult, sleep } from '../utils/testRunner'
import { tryCatch } from '../utils/tryCatch'

/**
 * Cleanup authStore state between tests
 */
async function cleanupAuthStore(): Promise<void> {
  const { logout, clearError } = useAuthStore.getState()
  logout()
  clearError()

  // Wait a bit for GunDB operations to complete
  await sleep(500)
}

/**
 * Generate unique test username
 */
function generateTestUsername(suffix: string = ''): string {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}${suffix}`
}

/**
 * Assert helper that works with browser tests
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Test input validation
 */
async function testInputValidation(runner: TestRunner): Promise<void> {
  // Test register validation
  await runner.run('Register with empty username', async () => {
    const result = await tryCatch(useAuthStore.getState().register('', 'password123'))
    assert(result.error !== null, 'Should fail with empty username')
    assert(
      result.error?.toString().includes('Username is required'),
      'Should validate empty username'
    )
  })

  await runner.run('Register with short password', async () => {
    const result = await tryCatch(useAuthStore.getState().register('user', '123'))
    assert(result.error !== null, 'Should fail with short password')
    assert(
      result.error?.toString().includes('at least 6 characters'),
      'Should validate password length'
    )
  })

  // Test login validation
  await runner.run('Login with empty username', async () => {
    const result = await tryCatch(useAuthStore.getState().login('', 'password123'))
    assert(result.error !== null, 'Should fail with empty username')
    assert(
      result.error?.toString().includes('Username is required'),
      'Should validate empty username'
    )
  })

  await runner.run('Login with empty password', async () => {
    const result = await tryCatch(useAuthStore.getState().login('user', ''))
    assert(result.error !== null, 'Should fail with empty password')
    assert(
      result.error?.toString().includes('Password is required'),
      'Should validate empty password'
    )
  })
}

/**
 * Test basic operations
 */
async function testBasicOperations(runner: TestRunner): Promise<void> {
  await runner.run('Login after logout should not error', async () => {
    const username = generateTestUsername('_auth_regression')
    const password = 'testpass123'

    // First, create the user
    const registerResult = await tryCatch(useAuthStore.getState().register(username, password))
    if (registerResult.error) {
      throw registerResult.error
    }

    // Logout to test authentication
    useAuthStore.getState().logout()

    // Now try to authenticate
    const loginResult = await tryCatch(useAuthStore.getState().login(username, password))
    assert(loginResult.error === null, `Login should not error: ${loginResult.error?.toString()}`)

    // Verify user was authenticated successfully
    const { user, isAuthenticated } = useAuthStore.getState()
    assert(isAuthenticated, 'Should be authenticated')
    assert(user !== null, 'Should have user object')

    // Verify user.is is actually set in GunDB
    const gun = gunService.getGun()
    assert(gun !== null, 'GunDB should be initialized')
    const gunUser = gun.user()
    assert(gunUser.is !== undefined, 'Gun user should be set')
    assert(gunUser.is?.pub !== undefined, 'User should have pub key')

    console.log(`  Authenticated successfully: ${gunUser.is.pub.substring(0, 20)}...`)
  })

  await runner.run('Duplicate registration should error', async () => {
    const username = generateTestUsername('_creation_regression')
    const password = 'testpass123'

    // First, create the user
    const registerResult = await tryCatch(useAuthStore.getState().register(username, password))
    if (registerResult.error) {
      throw registerResult.error
    }

    // Verify user was created successfully
    const { user, isAuthenticated } = useAuthStore.getState()
    assert(isAuthenticated, 'Should be authenticated')
    assert(user !== null, 'Should have user object')

    // Now try to create the same user again
    const result = await tryCatch(useAuthStore.getState().register(username, password))

    // Should receive a user creation error
    assert(result.error !== null, 'Should error when creating existing user')
    assert(
      result.error?.toString().includes('User already created'),
      `Should indicate user already exists; observed: ${result.error?.toString()}`
    )

    // AuthStore state should have user-friendly error
    const state = useAuthStore.getState()
    assert(
      state.error?.includes('Could not create account. Username may already be taken'),
      `Should show user-friendly error message; observed: ${state.error}`
    )

    console.log(`  User creation correctly rejected existing user`)
  })

  await runner.run('Logout clears state properly', async () => {
    const username = generateTestUsername('_logout')
    await useAuthStore.getState().register(username, 'password123')

    // Verify authenticated state
    const authState = useAuthStore.getState()
    assert(authState.isAuthenticated, 'Should be authenticated before logout')
    assert(authState.user !== null, 'Should have user before logout')

    // Logout
    useAuthStore.getState().logout()

    // Verify cleared state
    const loggedOutState = useAuthStore.getState()
    assert(!loggedOutState.isAuthenticated, 'Should not be authenticated after logout')
    assert(loggedOutState.user === null, 'Should have no user after logout')
    assert(loggedOutState.error === null, 'Should have no error after logout')
  })

  await runner.run('Clear error works correctly', async () => {
    // Trigger an error first
    await tryCatch(useAuthStore.getState().register('', ''))
    let state = useAuthStore.getState()
    assert(state.error !== null, 'Should have error after failed validation')

    // Clear error
    useAuthStore.getState().clearError()
    state = useAuthStore.getState()
    assert(state.error === null, 'Should have no error after clearError')
  })
}

/**
 * Test state transitions during authentication operations
 */
async function testStateTransitions(runner: TestRunner): Promise<void> {
  await runner.run('Loading state during register', async () => {
    const username = generateTestUsername('_loading')

    const initialState = useAuthStore.getState()
    assert(!initialState.isLoading, 'Should not be loading initially')

    const registerPromise = useAuthStore.getState().register(username, 'password123')
    const loadingState = useAuthStore.getState()
    assert(loadingState.isLoading, 'Should be loading during register')

    await registerPromise
    const finalState = useAuthStore.getState()
    assert(!finalState.isLoading, 'Should not be loading after success')
    assert(finalState.isAuthenticated, 'Should be authenticated after success')
    assert(finalState.error === null, 'Should have no error after success')
  })

  await runner.run('State cleanup on register failure', async () => {
    // Use existing username to trigger failure
    const username = generateTestUsername('_cleanup')
    await useAuthStore.getState().register(username, 'password123')
    await useAuthStore.getState().logout()

    const result = await tryCatch(useAuthStore.getState().register(username, 'password123'))
    const finalState = useAuthStore.getState()

    assert(result.error !== null, 'Should fail to register existing user')
    assert(!finalState.isLoading, 'Should not be loading after failure')
    assert(!finalState.isAuthenticated, 'Should not be authenticated after failure')
    assert(finalState.error !== null, 'Should have error message')
  })
}

/**
 * Test error handling for various scenarios
 */
async function testErrorHandling(runner: TestRunner): Promise<void> {
  await runner.run('User creation error shows friendly message', async () => {
    const username = generateTestUsername('_friendly')
    await useAuthStore.getState().register(username, 'password123')
    await useAuthStore.getState().logout()

    // Try to create the same user again - should fail gracefully
    const result = await tryCatch(useAuthStore.getState().register(username, 'password123'))
    const state = useAuthStore.getState()

    // The thrown error should contain the original message
    assert(
      result.error?.toString().includes('User already created'),
      'Should throw original error with "User already created"'
    )

    // But the authStore state should show friendly message
    assert(
      state.error?.includes('Could not create account. Username may already be taken'),
      'Should show user-friendly error for existing username'
    )
  })

  await runner.run('Unexpected errors show validation not modal', async () => {
    const username = generateTestUsername('_unexpected')

    const result = await tryCatch(useAuthStore.getState().register(username, ''))
    // Empty password should trigger validation error (not global modal)
    assert(
      result.error?.toString().includes('Password must be at least 6 characters'),
      'Should show validation error for empty password'
    )

    // The authStore state should show the validation error
    const state = useAuthStore.getState()
    assert(
      state.error?.includes('Password must be at least 6 characters'),
      'Should have validation error in state'
    )
  })
}

/**
 * Test session management functionality
 */
async function testSessionManagement(runner: TestRunner): Promise<void> {
  await runner.run('Session persistence after register', async () => {
    const username = generateTestUsername('_session')
    await useAuthStore.getState().register(username, 'password123')

    // Simulate page refresh by checking session
    await useAuthStore.getState().checkSession()

    const state = useAuthStore.getState()
    assert(state.isAuthenticated, 'Should maintain authentication after session check')
    assert(state.user !== null, 'Should have user object after session check')
  })

  await runner.run('Session check with no existing session', async () => {
    // Ensure we're logged out first
    useAuthStore.getState().logout()

    await useAuthStore.getState().checkSession()
    const state = useAuthStore.getState()

    assert(!state.isAuthenticated, 'Should not be authenticated when no session exists')
    assert(state.user === null, 'Should have no user when no session exists')
    assert(!state.isLoading, 'Should not be loading after session check')
  })
}

/**
 * Run all AuthStore tests
 */
export async function testAuthStore(): Promise<TestSuiteResult> {
  console.log('🧪 Testing AuthStore...\n')
  console.log('='.repeat(60))

  // Pre-test cleanup
  await cleanupAuthStore()

  const runner = new TestRunner('AuthStore')

  // Run all test suites
  await testInputValidation(runner)
  await testBasicOperations(runner)
  await testStateTransitions(runner)
  await testErrorHandling(runner)
  await testSessionManagement(runner)

  console.log('\n✅ AuthStore tests complete!')
  runner.printResults()

  // Post-test cleanup
  await cleanupAuthStore()

  return runner.getResults()
}
