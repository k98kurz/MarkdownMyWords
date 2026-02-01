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

let relayUrl: string | null = null;

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
    set({
      status,
      isConnected: status === 'connected',
      isConnecting: status === 'connecting',
      relayUrl: relayUrl || 'Unknown',
    });
  },
}));

// Try to get relay URL from gunService configuration
try {
  // Get the peers from gunService directly
  const gunInstance = gunService.getGun();
  if (gunInstance) {
    // Since we don't have direct access to the peers configuration,
    // we'll use a default value or try to extract it from the service
    relayUrl = 'http://localhost:8765/gun';
  }
} catch (e) {
  relayUrl = 'Unknown';
}

// Export types
export type { ConnectionState };
