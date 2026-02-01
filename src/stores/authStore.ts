/**
 * Auth Store
 *
 * Zustand store for authentication state management using GunDB's SEA.
 */

import { create } from 'zustand'
import { gunService } from '../services/gunService'
import { success, failure, match, tryCatch, type Result } from '../utils/functionalResult'
import type { IGunUserInstance } from 'gun/types'

// Replace all 'any' types with discriminated union
type AuthError =
  | { type: 'VALIDATION_ERROR'; message: string; originalError?: unknown }
  | { type: 'USER_EXISTS'; message: string; originalError?: unknown }
  | { type: 'AUTH_FAILED'; message: string; originalError?: unknown }
  | { type: 'CONNECTION_FAILED'; message: string; originalError?: unknown }
  | { type: 'SYNC_ERROR'; message: string; originalError?: unknown }
  | { type: 'UNKNOWN_ERROR'; message: string; originalError?: unknown }

// Type-safe user object (replace 'any')
interface AuthenticatedUser {
  user: IGunUserInstance
  pub: string
}

export type { AuthError, AuthenticatedUser }

/**
 * Auth State Interface
 */
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
        originalError: error,
      }
    }
    if (error.message.includes('Authentication failed')) {
      return {
        type: 'AUTH_FAILED',
        message: 'Invalid username or password',
        originalError: error,
      }
    }
    if (error.message.includes('GunDB not initialized')) {
      return {
        type: 'CONNECTION_FAILED',
        message: 'GunDB not initialized',
        originalError: error,
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
        return { type: 'CONNECTION_FAILED', message: gunError.message, originalError: error }
      case 'SYNC_ERROR':
        return { type: 'AUTH_FAILED', message: gunError.message, originalError: error }
    }
  }

  return {
    type: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred',
    originalError: error,
  }
}

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
  const handleResult = match(
    (user: AuthenticatedUser) => {
      set({
        user: user.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    },
    (error: AuthError) => {
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

  handleResult(result)
}

/**
 * Auth Store
 *
 * Manages authentication state using GunDB's SEA.
 * Handles user registration, login, logout, and session persistence.
 */
export const useAuthStore = create<AuthState>(set => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Register a new user
   */
  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null })

    const validationResult = validateAuthInput(username, password)
    if (!validationResult.success) {
      const error = validationResult.error
      handleAuthResult(validationResult, set)
      throw error
    }

    const createResult = await tryCatch(async () => {
      await gunService.createUser(username.trim(), password)
      await gunService.authenticateUser(username.trim(), password)
      await gunService.writeProfile()
      return undefined
    }, transformAuthError)

    if (!createResult.success) {
      const createError = createResult.error
      handleAuthResult(createResult, set)
      throw createError
    }

    const userResult = getAuthenticatedUser()
    handleAuthResult(userResult, set)

    if (!userResult.success) {
      const userError = userResult.error
      throw userError
    }
  },

  /**
   * Login user
   */
  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })

    const validationResult = validateAuthInput(username, password)
    if (!validationResult.success) {
      const validationError = validationResult.error
      handleAuthResult(validationResult, set)
      throw validationError
    }

    const authResult = await tryCatch(
      () => gunService.authenticateUser(username.trim(), password),
      transformAuthError
    )
    if (!authResult.success) {
      const loginError = authResult.error
      handleAuthResult(authResult, set)
      throw loginError
    }

    const userResult = getAuthenticatedUser()
    handleAuthResult(userResult, set)

    if (!userResult.success) {
      const finalError = userResult.error
      throw finalError
    }
  },

  /**
   * Logout user
   */
  logout: () => {
    try {
      // Get GunDB instance
      const gun = gunService.getGun()
      if (gun) {
        // Leave the current user session
        gun.user().leave()
      }
    } catch (error) {
      console.error('Error during logout:', error)
    }

    // Clear state
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    })
  },

  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null })
  },

  /**
   * Check for existing session
   * Called on app initialization to restore session
   */
  checkSession: async () => {
    set({ isLoading: true })

    const result = await tryCatch(async () => {
      const gun = gunService.getGun()
      if (!gun) {
        throw new Error('GunDB not initialized')
      }

      // Simplified session checking - single timeout instead of dual timeouts
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Session check timeout'))
        }, 1000)

        gun.user().recall({ sessionStorage: true }, (_ack: unknown) => {
          clearTimeout(timeout)

          // Check user state synchronously after recall completes
          setTimeout(() => {
            const gunUser = gun.user()
            if (gunUser.is?.pub) {
              resolve()
            } else {
              reject(new Error('No authenticated session'))
            }
          }, 100) // Give GunDB time to process the recall
        })
      })
    }, transformAuthError)

    // Handle session check result
    const handleSessionResult = match(
      () => {
        // Session valid - get user and update state
        const userResult = getAuthenticatedUser()
        handleAuthResult(userResult, set)
      },
      () => {
        set({
          isLoading: false,
          isAuthenticated: false,
          user: null,
          error: null,
        })
      }
    )

    handleSessionResult(result)
  },
}))
