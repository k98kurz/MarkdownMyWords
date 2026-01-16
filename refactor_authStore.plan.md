# Refactoring AuthStore to Use Functional Result Pattern

## Overview

This plan outlines the refactoring of `src/stores/authStore.ts` to use the functional Result pattern from `src/utils/functionalResult.ts`, eliminating type safety violations and improving error handling consistency.

## Current Issues

### 1. Type Safety Violations (FORBIDDEN)

- Line 15: `user: any | null` - violates "NEVER USE 'any' TYPE" rule
- Line 135: `catch (error: any)` - violates "NEVER USE 'as any' ASSERTIONS" rule
- Line 198: `(_ack: any)` - untyped GunDB acknowledgment parameter

### 2. Repetitive Code Patterns

- Each async method repeats identical error handling structure
- Validation logic duplicated across register/login methods
- State update patterns repeated in try/catch blocks

### 3. Inconsistent Error Types

- Mix of Error objects, GunError shapes, and unknown types
- Inconsistent error checking: `error?.code`, `error instanceof Error`
- No centralized error transformation

### 4. Nested Error Handling

- Sequential async operations use nested try/catch instead of composition
- No functional composition for multi-step authentication flows

## Refactoring Strategy

### Phase 1: Define Type-Safe Error System

```typescript
// Import required utilities from functionalResult
import { success, failure, type Result } from '../utils/functionalResult'

// Replace all 'any' types with discriminated union
type AuthError =
  | { type: 'VALIDATION_ERROR'; message: string }
  | { type: 'USER_EXISTS'; message: string }
  | { type: 'AUTH_FAILED'; message: string }
  | { type: 'CONNECTION_FAILED'; message: string }
  | { type: 'SYNC_ERROR'; message: string }
  | { type: 'UNKNOWN_ERROR'; message: string; originalError?: unknown }

// Type-safe user object (replace 'any')
interface AuthenticatedUser {
  user: IGunUserInstance // From 'gun/types'
  pub: string
}
```

### Phase 2: Extract Validation Logic

```typescript
// Centralized input validation (eliminates duplication)
const validateAuthInput = (username: string, password: string): Result<void, AuthError> => {
  if (!username?.trim()) {
    return failure({ type: 'VALIDATION_ERROR', message: 'Username is required' })
  }
  if (!password || password.length < 6) {
    return failure({ type: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters' })
  }
  return success(undefined)
}
```

### Phase 3: Centralized Error Transformation

```typescript
// Transform all error types to consistent AuthError (eliminates type mixing)
// CRITICAL: Preserve existing error detection logic from current implementation
const transformAuthError = (error: unknown): AuthError => {
  // Preserve the exact error message detection logic from current authStore.ts:80-86
  if (error instanceof Error) {
    if (error.message.includes('User creation failed')) {
      // Match the user-friendly message that tests expect in store state
      return {
        type: 'USER_EXISTS',
        message: 'Could not create account. Username may already be taken.',
      }
    }
    if (error.message.includes('Authentication failed')) {
      return {
        type: 'AUTH_FAILED',
        message: 'Invalid username or password',
      }
    }
    if (error.message.includes('GunDB not initialized')) {
      return {
        type: 'CONNECTION_FAILED',
        message: 'GunDB not initialized',
      }
    }

    // Generic error case - preserve original message
    return {
      type: 'UNKNOWN_ERROR',
      message: error.message,
      originalError: error,
    }
  }

  // GunError objects from gunService with proper type guard
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const gunError = error as { code: string; message: string }
    switch (gunError.code) {
      case 'CONNECTION_FAILED':
        return { type: 'CONNECTION_FAILED', message: gunError.message }
      case 'SYNC_ERROR':
        return { type: 'AUTH_FAILED', message: gunError.message }
    }
  }

  return {
    type: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    originalError: error,
  }
}
```

### Phase 4: Create Helper Functions

```typescript
// Import required utilities
import { success, failure, match, chain, tryCatch, type Result } from '../utils/functionalResult'
import type { IGunUserInstance } from 'gun/types'

// Get authenticated user from GunDB (extracted for reuse)
const getAuthenticatedUser = (): Result<AuthenticatedUser, AuthError> => {
  try {
    const gun = gunService.getGun()
    if (!gun) {
      return failure({
        type: 'CONNECTION_FAILED',
        message: 'GunDB not initialized',
      })
    }

    const gunUser = gun.user()
    if (!gunUser.is?.pub) {
      return failure({ type: 'AUTH_FAILED', message: 'User not authenticated' })
    }

    return success({
      user: gunUser,
      pub: gunUser.is.pub,
    })
  } catch (error) {
    return failure(transformAuthError(error))
  }
}

// Unified result handler (eliminates state update duplication)
// CRITICAL: Never calls global error modal - preserves current behavior
const handleAuthResult = (
  result: Result<AuthenticatedUser, AuthError>,
  set: (state: Partial<AuthState>) => void
): void => {
  match(
    result,
    user => {
      set({
        user: user.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    },
    error => {
      set({
        isLoading: false,
        error: error.message,
        isAuthenticated: false,
        user: null,
      })

      // IMPORTANT: No global error handling - all auth errors handled locally
      // This prevents unwanted error modals during authentication
    }
  )
}
```

### Phase 5: Refactor Auth Methods

#### Refactored Register Method

```typescript
register: async (username: string, password: string) => {
  set({ isLoading: true, error: null });

  const result = await pipe(
    validateAuthInput(username, password),
    chain(() => tryCatch(() => gunService.createUser(username.trim(), password), transformAuthError)),
    chain(() => tryCatch(() => gunService.authenticateUser(username.trim(), password), transformAuthError)),
    chain(() => tryCatch(() => gunService.writeProfile(), transformAuthError)),
    chain(() => getAuthenticatedUser())
  );

  handleAuthResult(result, set);

  // IMPORTANT: Re-throw error to preserve current test behavior
  // Tests expect the original error to be thrown, not the user-friendly message
  if (!result.success) {
    throw result.error.originalError || result.error;
  }
},
```

#### Refactored Login Method

```typescript
login: async (username: string, password: string) => {
  set({ isLoading: true, error: null });

  const result = await pipe(
    validateAuthInput(username, password),
    chain(() => tryCatch(() => gunService.authenticateUser(username.trim(), password), transformAuthError)),
    chain(() => getAuthenticatedUser())
  );

  handleAuthResult(result, set);

  // IMPORTANT: Re-throw error to preserve current test behavior
  // Tests expect the original error to be thrown, not the user-friendly message
  if (!result.success) {
    throw result.error.originalError || result.error;
  }
},
```

#### Refactored checkSession Method (SIMPLIFIED)

```typescript
checkSession: async () => {
  set({ isLoading: true });

  const result = await tryCatch(async () => {
    const gun = gunService.getGun();
    if (!gun) {
      throw new Error('GunDB not initialized');
    }

    // Simplified session checking - single timeout instead of dual timeouts
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Session check timeout'));
      }, 1000);

      gun.user().recall({ sessionStorage: true }, (_ack: unknown) => {
        clearTimeout(timeout);

        // Check user state synchronously after recall completes
        setTimeout(() => {
          const gunUser = gun.user();
          if (gunUser.is?.pub) {
            resolve();
          } else {
            reject(new Error('No authenticated session'));
          }
        }, 100); // Give GunDB time to process the recall
      });
    });
  }, transformAuthError);

  // Handle session check result
  match(
    result,
    () => {
      // Session valid - get user and update state
      const userResult = getAuthenticatedUser();
      handleAuthResult(userResult, set);
    },
    () => {
      // No session - clear auth state
      set({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      });
    }
  );
},
```

### Phase 6: Update Interface

```typescript
interface AuthState {
  // State - Replace 'any' with proper types
  user: IGunUserInstance | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions - Keep same interface for backward compatibility
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  register: (username: string, password: string) => Promise<void>
  clearError: () => void
  checkSession: () => Promise<void>
}
```

## Implementation Order

### 1. Setup Phase

- Add new type definitions above the store
- Extract helper functions
- Add proper imports from functionalResult

### 2. Core Methods Refactor

- Start with `register` method (most complex)
- Then refactor `login` method
- Finally refactor `checkSession` method

### 3. Helper Updates

- Update `logout` method to remove try/catch (no async operations)
- Keep `clearError` method unchanged (no issues)

### 4. Testing Phase

- Run existing test suite to verify compatibility
- Update any tests that depend on internal implementation
- Verify error handling behavior matches current expectations
- Test that all authStore methods properly preserve error messages for tests expecting specific error strings

## Benefits

### 1. Type Safety

- **Eliminates all 'any' types** - resolves code style violations
- Uses discriminated unions for compile-time error checking
- Proper type guards for error type narrowing

### 2. Code Quality

- **DRY principle** - eliminates validation and error handling duplication
- Single responsibility - functions have clear, focused purposes
- Composition over nesting - clean async operation chains

### 3. Maintainability

- Centralized error transformation logic
- Consistent error handling across all methods
- Easier to add new error types or validation rules

### 4. Testability

- Pure validation and transformation functions
- Isolated business logic from state management
- Clear separation of concerns

## Migration Risks and Mitigations

### Risk: Breaking Test Expectations

**Mitigation**: Preserve the dual error handling pattern:

- Store state shows user-friendly messages (what tests check in `state.error`)
- Thrown errors preserve original messages (what tests check in `result.error`)
- Both patterns must match current implementation exactly

### Risk: Incorrect Error Message Detection

**Mitigation**: Use the exact error detection logic from current authStore.ts:

- Check for `"User creation failed"` prefix (not "User creation failed: ${ack.err}")
- Transform to `"Could not create account. Username may already be taken."` for store state
- Preserve original error for throwing to maintain test compatibility

### Risk: Session Checking Complexity

**Mitigation**: Simplified session checking approach:

- Single timeout instead of dual timeouts
- Proper cleanup with clearTimeout
- 100ms delay after recall to allow GunDB processing
- Use `unknown` for GunDB acknowledgment parameters

### Risk: Missing Import Statements

**Mitigation**: Add explicit imports at Phase 1:

```typescript
import { success, failure, match, chain, tryCatch, type Result } from '../utils/functionalResult'
import type { IGunUserInstance } from 'gun/types'
```

### Risk: Performance Impact

**Mitigation**: Functional composition adds minimal overhead; type checking at compile time only

### Risk: Reintroducing Global Error Modal

**Mitigation**: Ensure `handleAuthResult` never calls `useErrorStore.getState().setError()` - all auth errors must remain local to prevent unwanted error modals

### Risk: Incorrect GunDB Callback Typing

**Mitigation**: Use `unknown` type for all GunDB acknowledgment parameters (`_ack: unknown`) instead of `any` to maintain type safety while avoiding type assertion violations

## Success Criteria

1. ✅ Zero 'any' types in authStore.ts
2. ✅ All methods use Result pattern for error handling
3. ✅ Existing tests pass without modification - CRITICAL
4. ✅ Error handling behavior preserved from user perspective
5. ✅ Store state shows user-friendly error messages (tests expect)
6. ✅ Thrown errors preserve original messages (tests expect)
7. ✅ No global error modal triggers - all auth errors handled locally
8. ✅ All GunDB acknowledgment parameters properly typed as 'unknown'
9. ✅ Session checking simplified to single timeout approach
10. ✅ Code build succeeds with TypeScript ESLint

## Files to Modify

- `src/stores/authStore.ts` - main refactoring target
- No other files require changes (backward compatible interface)

## Files to Reference

- `src/utils/functionalResult.ts` - Result pattern implementation
- `src/services/gunService.ts` - service layer error types
- `src/test/authStore.test.ts` - existing test patterns for verification

---

**Critical Implementation Notes**:

- **Add explicit imports**: `import { success, failure, match, chain, tryCatch, type Result } from '../utils/functionalResult'`
- **Preserve dual error pattern**: Store state shows friendly messages, thrown errors preserve originals
- **Use exact error detection**: Check for `"User creation failed"` prefix from gunService.ts
- **Simplified session checking**: Single timeout with proper cleanup instead of dual timeouts
- **All GunDB acknowledgment parameters**: Must be typed as `unknown` (not `any`)
- **Never call global error modal**: All auth errors handled locally in `handleAuthResult`
- **Test compatibility is critical**: Existing tests must pass without modification

**Key Corrections from Original Plan**:

1. **Error Message Handling**: Don't assume GunDB error patterns - use current authStore logic
2. **Session Checking**: Simplified approach eliminates redundant timeout logic
3. **Missing Imports**: Added explicit import statements for functionalResult utilities
4. **Test Compatibility**: Preserve both thrown errors and store state messages exactly

**Next Steps**: Implement Phase 1 (type definitions and imports), then proceed with method refactoring in sequence, ensuring each step preserves test compatibility.
