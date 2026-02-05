/**
 * Connection Store
 *
 * Zustand store for managing GunDB connection state.
 * Polls gunService for connection status and provides reactive state for UI.
 */

import { create } from 'zustand';
import { gunService } from '../services/gunService';

/**
 * Connection State Interface
 */
interface ConnectionState {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  relayUrl: string | null;

  // Actions
  updateConnectionStatus: () => void;
}

/**
 * Connection Store
 *
 * Manages connection state by polling gunService.
 */
export const useConnectionStore = create<ConnectionState>(set => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  status: 'disconnected',
  relayUrl: null,

  // Action to update connection status
  updateConnectionStatus: () => {
    const status = gunService.getConnectionState();
    const relayUrl = gunService.getRelayUrl();
    set({
      status,
      isConnected: status === 'connected',
      isConnecting: status === 'connecting',
      relayUrl,
    });
  },
}));

// Export types
export type { ConnectionState };
