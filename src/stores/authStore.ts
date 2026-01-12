/**
 * Auth Store
 *
 * Zustand store for authentication state management using GunDB's SEA.
 */

import { create } from 'zustand';
import { gunService } from '../services/gunService';
import { useErrorStore } from './errorStore';

/**
 * Auth State Interface
 */
interface AuthState {
  // State
  user: any | null; // SEA user object from gun.user()
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  register: (username: string, password: string) => Promise<void>;
  clearError: () => void;
  checkSession: () => Promise<void>;
}

/**
 * Auth Store
 *
 * Manages authentication state using GunDB's SEA.
 * Handles user registration, login, logout, and session persistence.
 */
export const useAuthStore = create<AuthState>((set) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Register a new user
   */
  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      // Validate inputs
      if (!username || username.trim().length === 0) {
        throw new Error('Username is required');
      }

      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Create user with SEA
      const seaUser = await gunService.createSEAUser(username.trim(), password);

      // Get GunDB instance to access user object
      const gun = gunService.getInstance();
      if (!gun) {
        throw new Error('GunDB not initialized');
      }

      // Get the authenticated user object from GunDB
      const gunUser = gun.user();
      const userIs = gunUser.is as any;

      // Create user profile in GunDB
      const userId = userIs?.pub || seaUser.pub;
      if (userId) {
        await gunService.putUserProfile(userId, {
          profile: {
            username: username.trim(),
          },
        });
      }

      // Set authenticated state
      set({
        user: gunUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // For user creation failures, show user-friendly message
      const isUserCreationError = error?.code === 'USER_CREATION_FAILED';
      const errorMessage = isUserCreationError
        ? 'Could not create account. Username may already be taken.'
        : error instanceof Error
          ? error.message
          : 'Registration failed';

      set({
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
        user: null,
      });

      // Don't show global error modal for expected user creation failures
      // Only show modal for unexpected errors
      if (!isUserCreationError) {
        useErrorStore.getState().setError(error);
      }

      throw error;
    }
  },

  /**
   * Login user
   */
  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });

    try {
      // Validate inputs
      if (!username || username.trim().length === 0) {
        throw new Error('Username is required');
      }

      if (!password || password.length === 0) {
        throw new Error('Password is required');
      }

      // Authenticate with SEA
      await gunService.authenticateSEAUser(username.trim(), password);

      // Get GunDB instance to access user object
      const gun = gunService.getInstance();
      if (!gun) {
        throw new Error('GunDB not initialized');
      }

      // Get the authenticated user object from GunDB
      const gunUser = gun.user();

      // Set authenticated state
      set({
        user: gunUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      // For authentication failures, show user-friendly message
      const isAuthError = error?.code === 'AUTHENTICATION_FAILED';
      const errorMessage = isAuthError
        ? 'Invalid username or password'
        : error instanceof Error
          ? error.message
          : 'Login failed';

      set({
        isLoading: false,
        error: errorMessage,
        isAuthenticated: false,
        user: null,
      });

      // Don't show global error modal for expected auth failures
      // Only show modal for unexpected errors
      if (!isAuthError) {
        useErrorStore.getState().setError(error);
      }

      throw error;
    }
  },

  /**
   * Logout user
   */
  logout: () => {
    try {
      // Get GunDB instance
      const gun = gunService.getInstance();
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

    try {
      const gun = gunService.getInstance();
      if (!gun) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      // Try to recall session from localStorage
      // GunDB's SEA stores session in localStorage automatically
      return new Promise<void>((resolve) => {
        gun.user().recall({ sessionStorage: true }, (_ack: any) => {
          // Check if user is authenticated after recall
          // Give it a moment for the session to restore
          setTimeout(() => {
            const gunUser = gun.user();
            const userIs = gunUser.is as any;

            if (userIs && userIs.pub) {
              // User is authenticated
              set({
                user: gunUser,
                isAuthenticated: true,
                isLoading: false,
                error: null,
              });
            } else {
              // No authenticated user
              set({
                isLoading: false,
                isAuthenticated: false,
                user: null,
              });
            }
            resolve();
          }, 100);
        });

        // Timeout fallback - check user state directly after a delay
        setTimeout(() => {
          const gunUser = gun.user();
          const userIs = gunUser.is as any;

          if (userIs && userIs.pub) {
            set({
              user: gunUser,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } else {
            set({
              isLoading: false,
              isAuthenticated: false,
              user: null,
            });
          }
          resolve();
        }, 500);
      });
    } catch (error) {
      console.error('Error checking session:', error);
      set({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      });
    }
  },
}));
