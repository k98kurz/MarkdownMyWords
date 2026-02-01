/**
 * Error Modal Component
 *
 * Modal for displaying errors with proper JSON serialization
 * and copy-to-clipboard functionality.
 */

import { useState } from 'react';
import { useErrorStore } from '../stores/errorStore';

/**
 * Safely stringify an error, handling circular references
 */
function safeStringify(error: unknown, space: number = 2): string {
  const seen = new WeakSet();

  return JSON.stringify(
    error,
    (_key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }

      // Handle functions
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }

      // Handle undefined
      if (value === undefined) {
        return '[undefined]';
      }

      // Handle Error objects specially
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

  /**
   * Copy error to clipboard
   */
  const handleCopy = async () => {
    try {
      const errorText = `Error: ${error.message}\n\nTimestamp: ${new Date(error.timestamp).toISOString()}\n\nFull Error:\n${errorJson}`;
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = errorJson;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="error-modal-overlay" onClick={closeModal}>
      <div className="error-modal" onClick={e => e.stopPropagation()}>
        <div className="error-modal-header">
          <h2>⚠️ Error</h2>
          <button
            className="error-modal-close"
            onClick={closeModal}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="error-modal-content">
          <div className="error-message-section">
            <h3>Error Message</h3>
            <div className="error-message-text">{error.message}</div>
          </div>

          {error.stack && (
            <div className="error-stack-section">
              <h3>Stack Trace</h3>
              <pre className="error-stack">{error.stack}</pre>
            </div>
          )}

          <div className="error-details-section">
            <div className="error-details-header">
              <h3>Full Error Details</h3>
              <button
                className="copy-button"
                onClick={handleCopy}
                title="Copy error to clipboard"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
            <pre className="error-json">{errorJson}</pre>
          </div>

          <div className="error-timestamp">
            <small>
              Error occurred at: {new Date(error.timestamp).toLocaleString()}
            </small>
          </div>
        </div>

        <div className="error-modal-footer">
          <button className="error-modal-button" onClick={clearError}>
            Dismiss
          </button>
          <button className="error-modal-button primary" onClick={closeModal}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
