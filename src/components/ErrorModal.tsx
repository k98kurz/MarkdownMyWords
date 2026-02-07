import { useState } from 'react';
import { useErrorStore } from '../stores/errorStore';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

function safeStringify(error: unknown, space: number = 2): string {
  const seen = new WeakSet();

  return JSON.stringify(
    error,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }

      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }

      if (value === undefined) {
        return '[undefined]';
      }

      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }

      return value;
    },
    space
  );
}

export function ErrorModal() {
  const { error, isOpen, clearError, closeModal } = useErrorStore();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !error) {
    return null;
  }

  const errorJson = safeStringify(error.error);

  const handleCopy = async () => {
    try {
      const errorText = `Error: ${error.message}\n\nTimestamp: ${new Date(error.timestamp).toISOString()}\n\nFull Error:\n${errorJson}`;
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} className="max-w-4xl">
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-rose-500">⚠️ Error</h2>
        </div>

        <div className="mb-4 space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-card-foreground">
              Error Message
            </h3>
            <div className="rounded-md bg-muted px-4 py-3 text-card-foreground">
              {error.message}
            </div>
          </div>

          {error.stack && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-card-foreground">
                Stack Trace
              </h3>
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs text-card-foreground/90">
                {error.stack}
              </pre>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-card-foreground">
                Full Error Details
              </h3>
              <Button size="sm" variant="secondary" onClick={handleCopy}>
                {copied ? '✓ Copied!' : '📋 Copy'}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-4 text-xs text-card-foreground/90">
              {errorJson}
            </pre>
          </div>

          <div className="text-muted-foreground">
            <small>
              Error occurred at: {new Date(error.timestamp).toLocaleString()}
            </small>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={clearError}>
            Dismiss
          </Button>
          <Button variant="primary" onClick={closeModal}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
