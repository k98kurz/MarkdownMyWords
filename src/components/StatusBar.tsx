import React from 'react';
import { useConnectionStore } from '../stores/connectionStore';

export const StatusBar: React.FC = () => {
  const { status, relayUrl } = useConnectionStore();

  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return {
          text: 'Connected',
          colorClass: 'bg-emerald-500',
          animate: false,
        };
      case 'connecting':
        return {
          text: 'Connecting...',
          colorClass: 'bg-yellow-500',
          animate: true,
        };
      case 'disconnected':
        return {
          text: 'Disconnected',
          colorClass: 'bg-rose-500',
          animate: false,
        };
      default:
        return { text: 'Unknown', colorClass: 'bg-gray-500', animate: false };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border-20 bg-background/95 backdrop-blur px-4 py-2">
      <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm">
        <div
          className={`h-2.5 w-2.5 rounded-full ${statusInfo.colorClass} ${statusInfo.animate ? 'animate-blink' : ''}`}
        />
        <span className="text-card-foreground/80">
          {statusInfo.text} to relay: {relayUrl || 'Unknown'}
        </span>
      </div>
    </div>
  );
};
