/**
 * Auth Store
 *
 * Zustand store for authentication state management using GunDB's SEA.
 */

import { create } from 'zustand';
import { gunService } from '@/services/gunService';
import {
  success,
  failure,
  match,
  chain,
  pipe,
  sequence,
  tryCatch,
  isFailure,
  type Result,
} from '@/utils/functionalResult';
import type { IGunUserInstance } from 'gun/types';

// Replace all 'any' types with discriminated union
type AuthError =
  | { type: 'VALIDATION_ERROR'; message: string; originalError?: unknown }
  | { type: 'USER_EXISTS'; message: string; originalError?: unknown }
  | { type: 'AUTH_FAILED'; message: string; originalError?: unknown }
  | { type: 'INIT_FAILED'; message: string; originalError?: unknown }
  | { type: 'MISC_ERROR'; message: string; originalError?: unknown }
  | { type: 'UNKNOWN_ERROR'; message: string; originalError?: unknown };

// Type-safe user object (replace 'any')
interface AuthenticatedUser {
  user: IGunUserInstance;
  pub: string;
}

export type { AuthError, AuthenticatedUser };

/**
 * Auth State Interface
 */
interface AuthState {
  // State - Replace 'any' with proper types
  username: string | null;
  user: IGunUserInstance | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions - Keep same interface for backward compatibility
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  register: (username: string, password: string) => Promise<void>;
  clearError: () => void;
  checkSession: () => Promise<void>;
}

// Centralized input validation (eliminates duplication)
const validateAuthInput = (
  username: string,
  password: string
): Result<void, AuthError> => {
  if (!username?.trim()) {
    return failure({
      type: 'VALIDATION_ERROR',
      message: 'Username is required',
    });
  }
  if (!password || password.length < 6) {
    return failure({
      type: 'VALIDATION_ERROR',
      message: 'Password must be at least 6 characters',
    });
  }
  return success(undefined);
};

// Transform all error types to consistent AuthError (eliminates type mixing)
// CRITICAL: Preserve existing error detection logic from current implementation
const transformAuthError = (error: unknown): AuthError => {
  // Preserve the exact error message detection logic from current authStore.ts:80-86
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    if (error.message.includes('User creation failed')) {
      // Match the user-friendly message that tests expect in store state
      return {
        type: 'USER_EXISTS',
        message: 'Could not create account. Username may already be taken.',
        originalError: error,
      };
    }
    if (error.message.includes('Authentication failed')) {
      return {
        type: 'AUTH_FAILED',
        message: 'Invalid username or password',
        originalError: error,
      };
    }
    if (error.message.includes('GunDB not initialized')) {
      return {
        type: 'INIT_FAILED',
        message: 'GunDB not initialized',
        originalError: error,
      };
    }

    // Generic error case - preserve original message
    return {
      type: 'UNKNOWN_ERROR',
      message: error.message,
      originalError: error,
    };
  }

  return {
    type: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    originalError: error,
  };
};

// Get authenticated user from GunDB (extracted for reuse)
const getAuthenticatedUser = (): Result<AuthenticatedUser, AuthError> => {
  try {
    const gun = gunService.getGun();
    if (!gun) {
      return failure({
        type: 'INIT_FAILED',
        message: 'GunDB not initialized',
      });
    }

    const gunUser = gun.user();
    if (!gunUser.is?.pub) {
      return failure({
        type: 'AUTH_FAILED',
        message: 'User not authenticated',
      });
    }

    return success({
      user: gunUser,
      pub: gunUser.is.pub,
    });
  } catch (error) {
    return failure(transformAuthError(error));
  }
};

// Type guard for AuthenticatedUser
const isAuthenticatedUser = (data: unknown): data is AuthenticatedUser => {
  return (
    typeof data === 'object' && data !== null && 'user' in data && 'pub' in data
  );
};

// Unified result handler (eliminates state update duplication)
// CRITICAL: Never calls global error modal - preserves current behavior
// Generic to handle both Result<void, AuthError> (validation) and Result<AuthenticatedUser, AuthError> (auth)
const handleAuthResult = <T>(
  result: Result<T, AuthError>,
  set: (state: Partial<AuthState>) => void
): void => {
  match(
    (data: T) => {
      // Only set user if we have AuthenticatedUser data
      // If T is void (validation success), state will be set by subsequent operations
      if (isAuthenticatedUser(data)) {
        set({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      }
    },
    (error: AuthError) => {
      set({
        isLoading: false,
        error: error.message,
        isAuthenticated: false,
        user: null,
      });

      // IMPORTANT: No global error handling - all auth errors handled locally
      // This prevents unwanted error modals during authentication
    }
  )(result);
};

/**
 * Auth Store
 *
 * Manages authentication state using GunDB's SEA.
 * Handles user registration, login, logout, and session persistence.
 */
export const useAuthStore = create<AuthState>(set => ({
  // Initial state
  username: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Register a new user
   */
  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });

    // Compose all operations in single pipeline
    const result = await pipe(
      // Step 1: Validate input
      validateAuthInput(username, password),
      // Step 2: Create user, authenticate, and write profile (async operation)
      async validationResult => {
        if (isFailure(validationResult)) return validationResult;
        let res = await sequence([
          await gunService.createUser(username.trim(), password),
          await gunService.authenticateUser(username.trim(), password),
          await gunService.writeProfile()
        ]);
        return res.success ? success(undefined) : failure(transformAuthError(res.error));
      },
      // Step 3: Get authenticated user
      chain(() => getAuthenticatedUser())
    );

    // Handle final result (validation or auth errors both go here)
    handleAuthResult(result, set);

    // Read username from profile after successful registration
    if (!isFailure(result)) {
      const usernameResult = await gunService.readUsername();
      if (usernameResult.success) {
        set({ username: usernameResult.data });
      } else {
        set({ username: null });
      }
    }
  },

  /**
   * Login user
   */
  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });

    // Compose all operations in single pipeline
    const result = await pipe(
      // Step 1: Validate input
      validateAuthInput(username, password),
      // Step 2: Authenticate user (async operation)
      async validationResult => {
        if (isFailure(validationResult)) return validationResult;
        const authResult = await gunService.authenticateUser(
          username.trim(),
          password
        );
        if (!authResult.success)
          return failure(transformAuthError(authResult.error));
        return success(undefined);
      },
      // Step 3: Get authenticated user
      chain(() => getAuthenticatedUser())
    );

    // Handle final result (validation or auth errors both go here)
    handleAuthResult(result, set);

    // Read username from profile after successful login
    if (!isFailure(result)) {
      const usernameResult = await gunService.readUsername();
      if (usernameResult.success) {
        set({ username: usernameResult.data });
      } else {
        set({ username: null });
      }
    }
  },

  /**
   * Logout user
   */
  logout: () => {
    try {
      // Get GunDB instance
      const gun = gunService.getGun();
      if (gun) {
        // Leave the current user session
        gun.user().leave();
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }

    // Clear state
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Check for existing session
   * Called on app initialization to restore session
   */
  checkSession: async () => {
    set({ isLoading: true });

    const recallResult = await tryCatch(async () => {
      const gun = gunService.getGun();
      if (!gun) {
        throw new Error('GunDB not initialized');
      }

      return await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Session check timeout'));
        }, 1000);

        gun.user().recall({ sessionStorage: true }, (_ack: unknown) => {
          clearTimeout(timeout);
          const gunUser = gun.user();
          if (gunUser.is?.pub) {
            resolve();
          } else {
            reject(new Error('No authenticated session'));
          }
        });
      });
    }, transformAuthError);

    await match(
      async () => {
        handleAuthResult(getAuthenticatedUser(), set);

        const usernameResult = await gunService.readUsername();
        if (usernameResult.success) {
          set({ username: usernameResult.data });
        } else {
          set({ username: null });
        }
      },
      async (_: unknown) => {
        set({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          username: null,
          error: null,
        });
      }
    )(recallResult);
  },
}));
