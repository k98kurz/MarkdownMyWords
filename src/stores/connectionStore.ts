/**
 * Connection Store
 *
 * Zustand store for managing GunDB connection state.
 * Polls gunService for connection status and provides reactive state for UI.
 */

import { create } from 'zustand';
import { gunService } from '@/services/gunService';

/**
 * Connection State Interface
 */
interface ConnectionState {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  relays: Map<string, 'init' | 'connecting' | 'connected' | 'disconnected'>;
  peerConnectionTimes: Map<string, number>;

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
  relays: new Map(),
  peerConnectionTimes: new Map(),

  // Action to update connection status
  updateConnectionStatus: () => {
    const status = gunService.getConnectionState();
    const relays = gunService.getRelayStatuses();
    const peerConnectionTimes = new Map<string, number>();

    relays.forEach((_, url) => {
      const connectionTime = gunService.getPeerConnectionTime(url);
      if (connectionTime) {
        peerConnectionTimes.set(url, connectionTime);
      }
    });

    set({
      status,
      isConnected: status === 'connected',
      isConnecting: status === 'connecting',
      relays,
      peerConnectionTimes,
    });
  },
}));

// Export types
export type { ConnectionState };
