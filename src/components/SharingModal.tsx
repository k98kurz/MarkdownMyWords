import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Label } from './ui/Label';

interface SharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  userPub: string;
  isPublic: boolean;
  docKey?: string;
}

export function SharingModal({
  isOpen,
  onClose,
  docId,
  userPub,
  isPublic,
  docKey,
}: SharingModalProps) {
  const [pathCopyStatus, setPathCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [keyCopyStatus, setKeyCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [copyError, setCopyError] = useState<string | null>(null);

  const docUrl = `${window.location.origin}/doc/${userPub}/${docId}`;

  const handleCopyPath = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(docUrl);
      setPathCopyStatus('success');
      setTimeout(() => setPathCopyStatus('idle'), 2000);
    } catch {
      setPathCopyStatus('error');
      setCopyError('Failed to copy to clipboard');
    }
  };

  const handleCopyKey = async () => {
    if (!docKey) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(docKey);
      setKeyCopyStatus('success');
      setTimeout(() => setKeyCopyStatus('idle'), 2000);
    } catch {
      setKeyCopyStatus('error');
      setCopyError('Failed to copy to clipboard');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl">
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-card-foreground">
          Share Document
        </h2>

        <div className="mb-4">
          <Label htmlFor="doc-path">Document Path:</Label>
          <div className="flex gap-2 mt-2">
            <span
              id="doc-path"
              className="flex-1 px-3 py-2 rounded-md border border-border-20 bg-muted text-sm text-muted-foreground overflow-x-auto"
            >
              {docUrl}
            </span>
            <Button variant="secondary" onClick={handleCopyPath}>
              {pathCopyStatus === 'success' ? '✓' : '📋'}
            </Button>
          </div>
        </div>

        {isPublic ? (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              This document is public. Anyone with the link can view it.
            </p>
          </div>
        ) : (
          <div className="mb-4">
            <Label htmlFor="doc-key">Document Key:</Label>
            <div className="flex gap-2 mt-2">
              <input
                id="doc-key"
                type="text"
                value={docKey}
                disabled
                className="flex-1 px-3 py-2 rounded-md border border-border-20 bg-muted text-sm text-muted-foreground"
              />
              <Button variant="secondary" onClick={handleCopyKey}>
                {keyCopyStatus === 'success' ? '✓' : '📋'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this key with trusted recipients. They can enter it on the
              document page to access this private document.
            </p>
          </div>
        )}

        {copyError && (
          <div className="mb-4 p-3 rounded-md bg-rose-500/10 text-rose-500 text-sm border border-rose-500/20">
            {copyError}
          </div>
        )}

        <div className="flex justify-end mt-6">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
