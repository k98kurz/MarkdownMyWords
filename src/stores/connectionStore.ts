/**
 * Connection Store
 *
 * Zustand store for managing GunDB connection state.
 * Polls gunService for connection status and provides reactive state for UI.
 */

import { create } from 'zustand'
import { gunService } from '../services/gunService'

/**
 * Connection State Interface
 */
interface ConnectionState {
  // State
  isConnected: boolean
  isConnecting: boolean
  status: 'connected' | 'disconnected' | 'connecting'
  relayUrl: string | null

  // Actions
  updateConnectionStatus: () => void
}

let relayUrl: string | null = null

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
    const status = gunService.getConnectionState()
    set({
      status,
      isConnected: status === 'connected',
      isConnecting: status === 'connecting',
      relayUrl: relayUrl || 'Unknown',
    })
  },
}))

// Try to get relay URL from gunService configuration
const gunInstance = gunService.getInstance()
if (gunInstance) {
  try {
    // Try to extract peers configuration
    const peers = (gunInstance as any).opt && (gunInstance as any).opt.peers
    if (peers && Array.isArray(peers) && peers.length > 0) {
      relayUrl = peers[0] || 'Unknown'
    } else {
      relayUrl = 'Unknown'
    }
  } catch (e) {
    relayUrl = 'Unknown'
  }
}

// Export types
export type { ConnectionState }
