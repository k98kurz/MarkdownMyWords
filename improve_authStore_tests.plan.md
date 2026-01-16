# Plan to Improve AuthStore Tests

## Overview

This plan addresses the critical testing gaps in the authStore component.
Currently, authStore has regression tests that are not executable due to GunDB's
browser-only requirements. The existing tests use vitest (abandoned) and are not
accessible from the browser console where GunDB tests must run.

## Current State Analysis

### Issues Identified

1. **Inaccessible Tests**: `src/stores/__tests__/authStore.test.ts` uses vitest but GunDB requires browser execution
2. **Missing Test Coverage**: No tests for input validation, state transitions, error handling, or session management
3. **Mixed Test Frameworks**: Some tests use `TestRunner` (correct), others use vitest (broken)
4. **Critical Component Untested**: authStore is core to app functionality but lacks proper test coverage

### Valid Test Pattern (from existing working tests)

```typescript
export async function testSomething(): Promise<void> {
  console.log('🧪 Testing...')
  const runner = new TestRunner('Test Suite')

  await runner.task('Setup before test', async () => {
    // Optional resource setup before test
  })

  await runner.run('Test name', async () => {
    // Test logic using tryCatch for error handling
  })

  await runner.task('Cleanup after test', async () => {
    // Optional resource cleanup after test
  })

  runner.printResults()
  return runner.getResults()
}
```

## Implementation Plan

### Phase 1: Cleanup and Foundation

**1.1 Remove Broken Tests**

- Delete: `src/stores/__tests__/authStore.test.ts` (vitest-based, inaccessible)
- Remove any remaining vitest dependencies from authStore testing

**1.2 Create Browser-Based Test Structure**

- Create: `src/test/authStore.test.ts` using the established `TestRunner` pattern
- Follow the pattern from `src/test/gunService.test.ts` and `src/test/testNewGunSEAScheme.ts`
- Export main function for browser console execution

### Phase 2: Port Existing Regression Tests

**2.1 Convert Current Tests**

- Port the two critical regression tests from the existing file:
  - `Authentication ack.ok: 0 but user.is set` regression test
  - `User creation ack.ok: 0 but pub exists` regression test
- Use `tryCatch` pattern for consistent error handling
- Ensure tests are executable from browser console

**2.2 Regression Test Structure**

```typescript
async function testRegressionScenarios(runner: TestRunner): Promise<void> {
  await runner.run('Handle auth ack.ok:0 with user.is set', async () => {
    // Port existing authentication regression test
    // Use tryCatch for error handling
    // Verify user.is is properly checked when ack.ok is 0
  })

  await runner.run('Handle user creation ack.ok:0 with pub exists', async () => {
    // Port existing user creation regression test
    // Verify pub key existence is checked when ack.ok is 0
  })
}
```

### Phase 3: Add Comprehensive Test Coverage

**3.1 Input Validation Tests**

```typescript
async function testInputValidation(runner: TestRunner): Promise<void> {
  // Test register validation
  await runner.run('Register with empty username', async () => {
    const result = await tryCatch(useAuthStore.getState().register('', 'password123'))
    assert(result.error?.includes('Username is required'), 'Should validate empty username')
  })

  await runner.run('Register with short password', async () => {
    const result = await tryCatch(useAuthStore.getState().register('user', '123'))
    assert(result.error?.includes('at least 6 characters'), 'Should validate password length')
  })

  // Test login validation
  await runner.run('Login with empty username', async () => {
    const result = await tryCatch(useAuthStore.getState().login('', 'password123'))
    assert(result.error?.includes('Username is required'), 'Should validate empty username')
  })

  await runner.run('Login with empty password', async () => {
    const result = await tryCatch(useAuthStore.getState().login('user', ''))
    assert(result.error?.includes('Password is required'), 'Should validate empty password')
  })
}
```

**3.2 State Transition Tests**

```typescript
async function testStateTransitions(runner: TestRunner): Promise<void> {
  await runner.run('Loading state during register', async () => {
    const username = `test_${Date.now()}_loading`

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
    const username = `test_${Date.now()}_cleanup`
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
```

**3.3 Error Handling Tests**

```typescript
async function testErrorHandling(runner: TestRunner): Promise<void> {
  await runner.run('User creation error shows friendly message', async () => {
    const username = `test_${Date.now()}_friendly`
    await useAuthStore.getState().register(username, 'password123')
    await useAuthStore.getState().logout()

    await useAuthStore.getState().register(username, 'password123')
    const state = useAuthStore.getState()

    assert(
      state.error?.includes('Username may already be taken'),
      'Should show user-friendly error for existing username'
    )
  })

  await runner.run('Unexpected errors show global modal', async () => {
    // This would require mocking gunService to throw unexpected errors
    // For now, we can test the logic indirectly
    const username = `test_${Date.now()}_unexpected`

    const result = await tryCatch(useAuthStore.getState().register(username, ''))
    // Empty password should trigger validation error (not global modal)
    assert(
      result.error?.includes('Password is required'),
      'Should show validation error, not global modal'
    )
  })
}
```

**3.4 Session Management Tests**

```typescript
async function testSessionManagement(runner: TestRunner): Promise<void> {
  await runner.run('Session persistence after register', async () => {
    const username = `test_${Date.now()}_session`
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
```

**3.5 Basic Operation Tests**

```typescript
async function testBasicOperations(runner: TestRunner): Promise<void> {
  await runner.run('Logout clears state properly', async () => {
    const username = `test_${Date.now()}_logout`
    await useAuthStore.getState().register(username, 'password123')

    // Verify authenticated state
    const authState = useAuthStore.getState()
    assert(authState.isAuthenticated, 'Should be authenticated before logout')

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
```

### Phase 4: Integration and Utility Functions

**4.1 Main Test Export**

```typescript
export async function testAuthStore(): Promise<void> {
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
  await testRegressionScenarios(runner)

  console.log('\n✅ AuthStore tests complete!')
  runner.printResults()

  // Post-test cleanup
  await cleanupAuthStore()

  return runner.getResults()
}
```

**4.2 Helper Functions**

```typescript
/**
 * Cleanup authStore state between tests
 */
async function cleanupAuthStore(): Promise<void> {
  const { logout, clearError } = useAuthStore.getState()
  logout()
  clearError()

  // Wait a bit for GunDB operations to complete
  await sleep(500) // imported from testRunner
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
```

### Phase 5: Integration with Test Suite

**5.1 Update Test Runner**
Create or update `src/test/runAllTests.ts`:

```typescript
import { testGunService } from './gunService.test'
import { testAuthStore } from './authStore.test'
import { printTestSummary } from '../utils/testRunner'

export async function runAllTests(): Promise<void> {
  console.log('🚀 Running All Browser Tests\n')

  const suiteResults = []

  // Test GunDB Service first (authStore depends on it)
  const gunResult = await testGunService()
  suiteResults.push(gunResult)
  console.log('\n' + '='.repeat(60) + '\n')

  // Test AuthStore
  const authResult = await testAuthStore()
  suiteResults.push(authResult)

  // Print summary
  printTestSummary(suiteResults)
}
```

**5.2 Browser Console Usage**

```javascript
// In browser console:
await testAuthStore() // Run authStore tests only
await runAllTests() // Run all browser tests
```

## Implementation Requirements

### Key Constraints

1. **Browser Only**: All tests must work in browser console due to GunDB requirements
2. **TestRunner Pattern**: Use existing `TestRunner` and `tryCatch` utilities
3. **No Mocking**: Cannot easily mock GunDB in browser, test real behaviors
4. **Cleanup**: Proper state cleanup between tests to avoid interference
5. **Timeouts**: Appropriate timeouts for GunDB async operations

### Success Criteria

1. ✅ All tests executable from browser console
2. ✅ Comprehensive coverage of authStore functionality
3. ✅ Regression tests preserved and working
4. ✅ Proper error handling and validation tested
5. ✅ State transitions and session management verified
6. ✅ Integration with existing test runner

## Files to Create/Modify

### New Files

- `src/test/authStore.test.ts` - Main browser-based test file

### Files to Modify

- `src/test/runAllTests.ts` - Add authStore tests to runner (or create if not exists)
- `src/main.tsx` - Import testAuthStore and make available to browser

### Files to Remove

- `src/stores/__tests__/authStore.test.ts` - Remove broken vitest tests

## Test Execution Plan

### Development Testing

1. Create test file incrementally (phase by phase)
2. Test each phase in browser console during development (prompt user)
3. Ensure no test interference with each other

### Final Testing

1. Run complete test suite: `await runAllTests()`
2. Run authStore tests in isolation: `await testAuthStore()`
3. Verify all tests pass and provide useful output

### Documentation

1. Update any existing documentation on running tests
2. Ensure browser console usage is clearly documented

## Timeline Estimate

- **Phase 1** (Cleanup): 5-10 minutes
- **Phase 2** (Regression Tests): 10-20 minutes
- **Phase 3** (New Tests): 20-40 minutes
- **Phase 4** (Integration): 2-5 minutes

**Total Estimated Time: 37-75 minutes**

## Risk Mitigation

### Potential Issues

1. **GunDB Timing Issues**: Use appropriate delays and async handling
2. **Test Interference**: Implement proper cleanup between tests
3. **Browser Console Limitations**: Keep individual tests focused and short
4. **State Persistence**: Ensure tests don't leave artifacts affecting subsequent runs

### Mitigation Strategies

1. **Timeout Handling**: Add timeouts for GunDB operations with clear error messages
2. **State Isolation**: Implement comprehensive cleanup functions
3. **Incremental Development**: Test each phase thoroughly before proceeding
4. **Error Boundaries**: Use `tryCatch` consistently for graceful error handling

## Conclusion

This plan provides comprehensive test coverage for the authStore while working
within GunDB's browser constraints. The approach ensures critical functionality
is tested, regression issues are prevented, and the test infrastructure remains
consistent with the existing codebase patterns.

The modular phase approach allows for incremental implementation and testing,
reducing risk and ensuring each component works correctly before moving to the
next phase.
