import React, { useState } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';
import { Modal } from './ui/Modal';
import { ChangelogModal } from './ChangelogModal';
import { getChangelogTitle } from '@/lib/changelog';

export const StatusBar: React.FC = () => {
  const { status, relays, peerConnectionTimes } = useConnectionStore();
  const [isRelayModalOpen, setIsRelayModalOpen] = useState(false);
  const [isChangelogModalOpen, setIsChangelogModalOpen] = useState(false);
  const changelogTitle = getChangelogTitle();

  const connectedCount = Array.from(relays.values()).filter(
    s => s === 'connected'
  ).length;
  const totalRelays = relays.size;

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

  const statusText =
    !relays || relays.size === 0
      ? 'Not Connected to a Relay'
      : connectedCount > 0
        ? `Connected to ${connectedCount} of ${totalRelays} Relay${totalRelays !== 1 ? 's' : ''}`
        : `Connecting to ${totalRelays} Relay${totalRelays !== 1 ? 's' : ''}`;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-emerald-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'disconnected':
        return 'bg-rose-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatConnectionTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border-20 bg-background/95 backdrop-blur px-4 py-2">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${statusInfo.colorClass} ${statusInfo.animate ? 'animate-blink' : ''}`}
          />
          <span
            className="cursor-pointer text-card-foreground/80"
            onClick={() => setIsRelayModalOpen(true)}
          >
            {statusText}
          </span>
        </div>
        <div>
          <span
            className="cursor-pointer text-card-foreground/80 hover:text-card-foreground transition-colors"
            onClick={() => setIsChangelogModalOpen(true)}
          >
            {changelogTitle}
          </span>
        </div>
      </div>
      <Modal
        isOpen={isRelayModalOpen}
        onClose={() => setIsRelayModalOpen(false)}
        className="max-w-2xl"
      >
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold">Relay Connections</h2>
          {!relays || relays.size === 0 ? (
            <div className="text-center text-muted-foreground">
              No relays configured. Running in local-only mode.
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(relays.entries()).map(([url, status]) => {
                const connectionTime = peerConnectionTimes.get(url);

                return (
                  <div
                    key={url}
                    className="flex items-center justify-between rounded-md bg-muted p-4"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-card-foreground">
                        {url}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                        {connectionTime &&
                          ` since ${formatConnectionTime(connectionTime)}`}
                      </div>
                    </div>
                    <div
                      className={`ml-4 h-3 w-3 rounded-full ${getStatusColor(status)}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {relays.size === 0
                ? 'No relays configured'
                : `${connectedCount} of ${relays.size} relay${relays.size > 1 ? 's' : ''} connected`}
            </div>
          </div>
        </div>
      </Modal>
      <ChangelogModal
        isOpen={isChangelogModalOpen}
        onClose={() => setIsChangelogModalOpen(false)}
      />
    </div>
  );
};
