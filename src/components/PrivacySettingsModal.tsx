import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Label } from './ui/Label';
import { useDocumentStore } from '@/stores/documentStore';
import { encryptionService } from '@/services/encryptionService';

interface PrivacySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  currentIsPublic: boolean;
}

export function PrivacySettingsModal({
  isOpen,
  onClose,
  docId,
  currentIsPublic,
}: PrivacySettingsModalProps) {
  const [selectedPrivacy, setSelectedPrivacy] = useState<'public' | 'private'>(
    currentIsPublic === true ? 'public' : 'private'
  );
  const [currentKey, setCurrentKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingKey, setIsFetchingKey] = useState(false);

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

  const privacyChanged =
    selectedPrivacy !== (currentIsPublic === true ? 'public' : 'private');
  const keyChanged = !currentIsPublic && keyInput !== currentKey;
  const hasChanges = privacyChanged || keyChanged;

  const handleApplyChanges = async () => {
    setError(null);

    setIsLoading(true);

    try {
      const documentStore = useDocumentStore.getState();

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-card-foreground">
          Privacy Settings
        </h2>

        <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
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

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApplyChanges}
            disabled={!hasChanges || isLoading}
            isLoading={isLoading}
          >
            Apply Changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
