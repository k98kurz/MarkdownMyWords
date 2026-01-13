import React from 'react'
import { useConnectionStore } from '../stores/connectionStore'

/**
 * StatusBar Component
 *
 * Displays the current connection status to the GunDB relay.
 */
export const StatusBar: React.FC = () => {
  const { status, relayUrl } = useConnectionStore()

  // Get status text and color based on connection state
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { text: 'Connected', color: 'green' }
      case 'connecting':
        return { text: 'Connecting...', color: 'yellow' }
      case 'disconnected':
        return { text: 'Disconnected', color: 'red' }
      default:
        return { text: 'Unknown', color: 'gray' }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="status-bar">
      <div className="status-content">
        <div className={`status-indicator status-${statusInfo.color}`}></div>
        <span className="status-text">
          {statusInfo.text} to relay: {relayUrl || 'Unknown'}
        </span>
      </div>
    </div>
  )
}
