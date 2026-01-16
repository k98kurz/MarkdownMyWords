/**
 * Auth Store
 *
 * Zustand store for authentication state management using GunDB's SEA.
 */

import { create } from 'zustand'
import { gunService } from '../services/gunService'

/**
 * Auth State Interface
 */
interface AuthState {
  // State
  user: any | null // SEA user object from gun.user()
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  register: (username: string, password: string) => Promise<void>
  clearError: () => void
  checkSession: () => Promise<void>
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

    try {
      // Validate inputs
      if (!username || username.trim().length === 0) {
        throw new Error('Username is required')
      }

      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      // Create user (create, authenticate, write profile)
      await gunService.createUser(username.trim(), password)
      await gunService.authenticateUser(username.trim(), password)
      await gunService.writeProfile()

      // Get GunDB instance to access user object
      const gun = gunService.getGun()
      if (!gun) {
        throw new Error('GunDB not initialized')
      }

      // Get the authenticated user object from GunDB
      const gunUser = gun.user()

      // Set authenticated state
      set({
        user: gunUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (error: unknown) {
      // For user creation failures, show user-friendly message
      const isUserCreationError =
        error instanceof Error && error.message.includes('User creation failed')
      const errorMessage = isUserCreationError
        ? 'Could not create account. Username may already be taken.'
        : error instanceof Error
          ? error.message
          : 'Registration failed'

      set({
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
        user: null,
      })

      // Never show global error modal for registration failures - handle all locally
      throw error
    }
  },

  /**
   * Login user
   */
  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })

    try {
      // Validate inputs
      if (!username || username.trim().length === 0) {
        throw new Error('Username is required')
      }

      if (!password || password.length === 0) {
        throw new Error('Password is required')
      }

      // Authenticate with SEA
      await gunService.authenticateUser(username.trim(), password)

      // Get GunDB instance to access user object
      const gun = gunService.getGun()
      if (!gun) {
        throw new Error('GunDB not initialized')
      }

      // Get the authenticated user object from GunDB
      const gunUser = gun.user()

      // Set authenticated state
      set({
        user: gunUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (error: any) {
      // For all authentication failures, show user-friendly message locally
      const errorMessage = error instanceof Error ? error.message : 'Login failed'

      set({
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
        user: null,
      })

      // Never show global error modal for login failures - handle all locally
      throw error
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

    try {
      const gun = gunService.getGun()
      if (!gun) {
        set({ isLoading: false, isAuthenticated: false })
        return
      }

      // Try to recall session from localStorage
      // GunDB's SEA stores session in localStorage automatically
      return new Promise<void>(resolve => {
        gun.user().recall({ sessionStorage: true }, (_ack: any) => {
          // Check if user is authenticated after recall
          // Give it a moment for the session to restore
          setTimeout(() => {
            const gunUser = gun.user()

            if (gunUser.is && gunUser.is.pub) {
              // User is authenticated
              set({
                user: gunUser,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              })
            } else {
              // No authenticated user
              set({
                isLoading: false,
                isAuthenticated: false,
                user: null,
              })
            }
            resolve()
          }, 100)
        })

        // Timeout fallback - check user state directly after a delay
        setTimeout(() => {
          const gunUser = gun.user()

          if (gunUser.is && gunUser.is.pub) {
            set({
              user: gunUser,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
          } else {
            set({
              isLoading: false,
              isAuthenticated: false,
              user: null,
            })
          }
          resolve()
        }, 500)
      })
    } catch (error) {
      console.error('Error checking session:', error)
      set({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      })
    }
  },
}))
