/**
 * Connection Store
 *
 * Zustand store for managing Holster connection state.
 * Polls holsterService for connection status and provides reactive state for UI.
 */

import { create } from 'zustand';
import { holsterService } from '@/services/holsterService';
import { relayMonitor } from '@/services/relayMonitor';
import type { RelayStatus } from '@/types/holster';

/**
 * Connection State Interface
 */
interface ConnectionState {
  // State
  isConnected: boolean;
  isConnecting: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  relays: Map<string, RelayStatus>;
  peerConnectionTimes: Map<string, number>;

  // Actions
  updateConnectionStatus: () => void;
}

/**
 * Revision of the relay monitor at the last state sync. The monitor bumps its
 * revision on every real socket transition, so a poll with no changes is a
 * no-op and never re-renders subscribers (see main.tsx's 5s interval).
 */
let lastRevision = -1;

/**
 * Connection Store
 *
 * Manages connection state by polling holsterService, which reads the real
 * relay sockets tracked by relayMonitor.
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
    const revision = relayMonitor.getRevision();
    if (revision === lastRevision) {
      return;
    }
    lastRevision = revision;

    const status = holsterService.getConnectionState();
    const relays = holsterService.getRelayStatuses();
    const peerConnectionTimes = new Map<string, number>();

    relays.forEach((_, url) => {
      const connectionTime = holsterService.getPeerConnectionTime(url);
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
