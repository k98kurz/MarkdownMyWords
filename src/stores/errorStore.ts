/**
 * Error Store
 *
 * Global error state management for displaying errors in a modal.
 */

import { create } from 'zustand';

/**
 * Error Info Interface
 */
export interface ErrorInfo {
  message: string;
  error: unknown;
  timestamp: number;
  stack?: string;
}

/**
 * Error State Interface
 */
interface ErrorState {
  // State
  error: ErrorInfo | null;
  isOpen: boolean;

  // Actions
  setError: (error: unknown) => void;
  clearError: () => void;
  closeModal: () => void;
}

/**
 * Error Store
 *
 * Manages global error state for error modal display.
 */
export const useErrorStore = create<ErrorState>((set) => ({
  // Initial state
  error: null,
  isOpen: false,

  /**
   * Set error and open modal
   */
  setError: (error: unknown) => {
    let message = 'An unknown error occurred';
    let stack: string | undefined;

    if (error instanceof Error) {
      message = error.message || message;
      stack = error.stack;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object') {
      // Try to extract message from error object
      message = JSON.stringify(error);
    }

    set({
      error: {
        message,
        error,
        timestamp: Date.now(),
        stack,
      },
      isOpen: true,
    });
  },

  /**
   * Clear error and close modal
   */
  clearError: () => {
    set({
      error: null,
      isOpen: false,
    });
  },

  /**
   * Close modal without clearing error
   */
  closeModal: () => {
    set({ isOpen: false });
  },
}));
