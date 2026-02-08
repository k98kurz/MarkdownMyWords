import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { useDocumentStore } from '@/stores/documentStore';
import { encryptionService } from '@/services/encryptionService';

interface SharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  userPub: string;
  isPublic: boolean;
  docKey?: string;
  currentIsPublic: boolean;
}

export function SharingModal({
  isOpen,
  onClose,
  docId,
  userPub,
  isPublic,
  docKey,
  currentIsPublic,
}: SharingModalProps) {
  const [pathCopyStatus, setPathCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [keyCopyStatus, setKeyCopyStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [copyError, setCopyError] = useState<string | null>(null);

  const [selectedPrivacy, setSelectedPrivacy] = useState<'public' | 'private'>(
    currentIsPublic === true ? 'public' : 'private'
  );
  const [currentKey, setCurrentKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingKey, setIsFetchingKey] = useState(false);

  const docUrl = `${window.location.origin}/doc/${userPub}/${docId}`;

  const privacyChanged =
    selectedPrivacy !== (currentIsPublic === true ? 'public' : 'private');
  const keyChanged = !currentIsPublic && keyInput !== currentKey;
  const hasChanges = privacyChanged || keyChanged;

  const handleApplyChanges = async () => {
    setError(null);

    setIsLoading(true);

    try {
      const documentStore = useDocumentStore.getState();

      if (selectedPrivacy === 'private' && currentIsPublic !== false) {
        if (keyInput.length < 8) {
          setError('Encryption key must be at least 8 characters');
          setIsLoading(false);
          return;
        }
      }

      if (selectedPrivacy === 'public' && currentIsPublic !== true) {
        const result = await documentStore.setDocumentPublic(docId);
        if (!result.success) {
          throw new Error(result.error.message);
        }
      } else if (selectedPrivacy === 'private' && currentIsPublic !== false) {
        const result = await documentStore.setDocumentPrivate(docId, keyInput);
        if (!result.success) {
          throw new Error(result.error.message);
        }
      } else if (
        selectedPrivacy === 'private' &&
        currentIsPublic === false &&
        keyChanged
      ) {
        const result = await documentStore.changeDocumentKey(docId, keyInput);
        if (!result.success) {
          throw new Error(result.error.message);
        }
      }

      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const keyResult = await encryptionService.generateKey();
      if (keyResult.success) {
        setKeyInput(keyResult.data);
      } else {
        throw new Error(keyResult.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate key');
    }
  };

  const handlePrivacyChange = (value: 'public' | 'private') => {
    setSelectedPrivacy(value);
    setError(null);
  };

  useEffect(() => {
    setSelectedPrivacy(currentIsPublic ? 'public' : 'private');
    setKeyInput('');
    setError(null);
  }, [currentIsPublic]);

  useEffect(() => {
    const fetchCurrentKey = async () => {
      if (!currentIsPublic && isOpen) {
        setIsFetchingKey(true);
        try {
          const documentStore = useDocumentStore.getState();
          const result = await documentStore.getDocumentKey(docId);
          if (result.success && result.data) {
            setCurrentKey(result.data);
            setKeyInput(result.data);
          } else {
            setCurrentKey('');
            setKeyInput('');
          }
        } catch (err) {
          console.error('Failed to fetch current key:', err);
          setCurrentKey('');
          setKeyInput('');
        } finally {
          setIsFetchingKey(false);
        }
      } else {
        setCurrentKey('');
        setKeyInput('');
      }
    };

    fetchCurrentKey();
  }, [docId, currentIsPublic, isOpen]);

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
          Sharing/Privacy
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

        <div className="mb-4 mt-6 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            ⚠️ Warning: Changing privacy or encryption settings will reload the
            page. Any unsaved changes will be lost. Make sure to save your
            document before proceeding.
          </p>
        </div>

        <div className="mb-4">
          <Label>Privacy</Label>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="privacy"
                value="public"
                checked={selectedPrivacy === 'public'}
                onChange={() => handlePrivacyChange('public')}
                className="w-4 h-4"
              />
              <span className="text-sm">Public (not encrypted)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="privacy"
                value="private"
                checked={selectedPrivacy === 'private'}
                onChange={() => handlePrivacyChange('private')}
                className="w-4 h-4"
              />
              <span className="text-sm">Private (encrypted)</span>
            </label>
          </div>
        </div>

        {selectedPrivacy === 'private' && (
          <div className="mb-4">
            <Label htmlFor="docKey">Encryption Key</Label>
            <div className="flex gap-2 mt-2">
              <input
                id="docKey"
                type="text"
                value={isFetchingKey ? 'Loading...' : keyInput}
                onChange={e => setKeyInput(e.target.value)}
                disabled={isFetchingKey}
                placeholder="Enter encryption key"
                className="flex-1 px-3 py-2 rounded-md border border-border-20 bg-background text-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Button
                variant="secondary"
                onClick={handleGenerateKey}
                disabled={isFetchingKey}
              >
                Generate New Key
              </Button>
            </div>
            {keyChanged && (
              <p className="text-xs text-muted-foreground mt-2">
                Changing the encryption key will require anyone accessing this
                document to have the new key.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-md bg-rose-500/10 text-rose-500 text-sm border border-rose-500/20">
            {error}
          </div>
        )}

        {copyError && (
          <div className="mb-4 p-3 rounded-md bg-rose-500/10 text-rose-500 text-sm border border-rose-500/20">
            {copyError}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          {hasChanges && (
            <Button
              variant="primary"
              onClick={handleApplyChanges}
              disabled={!hasChanges || isLoading}
              isLoading={isLoading}
            >
              Apply Changes
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
