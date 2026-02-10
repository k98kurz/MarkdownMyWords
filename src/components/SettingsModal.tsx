import { useState, useEffect } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { usePreferences } from '@/providers/PreferenceProvider';
import { gunService } from '@/services/gunService';
import {
  success,
  failure,
  match,
  sequence,
  isFailure,
  type Result,
} from '@/lib/functionalResult';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type RelayValidationError =
  | { type: 'EMPTY_URL'; message: string }
  | { type: 'INVALID_PROTOCOL'; message: string }
  | { type: 'DUPLICATE_URL'; message: string };

type RelayItem = {
  url: string;
  isEditing: boolean;
  isNew: boolean;
};

const validateRelayUrl = (
  url: string,
  allUrls: string[],
  currentIndex: number
): Result<string, RelayValidationError> => {
  if (!url.trim()) {
    return failure({ type: 'EMPTY_URL', message: 'URL cannot be empty' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return failure({
      type: 'INVALID_PROTOCOL',
      message: 'Invalid URL format',
    });
  }

  const validProtocols = ['ws:', 'wss:', 'http:', 'https:'];
  if (!validProtocols.includes(parsedUrl.protocol)) {
    return failure({
      type: 'INVALID_PROTOCOL',
      message:
        'Invalid URL format (must start with http://, https://, ws://, or wss://)',
    });
  }

  const duplicates = allUrls.filter((u, i) => u === url && i !== currentIndex);
  if (duplicates.length > 0) {
    return failure({ type: 'DUPLICATE_URL', message: 'Duplicate relay URL' });
  }

  return success(url);
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme, editorPreferences, setEditorPreference } =
    usePreferences();
  const [tempRelays, setTempRelays] = useState<RelayItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<
    Map<number, RelayValidationError>
  >(new Map());
  const [showReloadMessage, setShowReloadMessage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const storedRelays = gunService.getStoredRelays();
      setTempRelays(
        storedRelays.map(url => ({ url, isEditing: false, isNew: false }))
      );
      setValidationErrors(new Map());
      setShowReloadMessage(false);
    }
  }, [isOpen]);

  const handleRelayChange = (index: number, value: string) => {
    setTempRelays(prev => {
      const next = [...prev];
      next[index].url = value;
      return next;
    });
  };

  const handleRelayBlur = (index: number) => {
    const relay = tempRelays[index];
    const allUrls = tempRelays.map(r => r.url);

    const result = validateRelayUrl(relay.url, allUrls, index);

    match<string, RelayValidationError, void>(
      () => {
        setValidationErrors(prev => {
          const next = new Map(prev);
          next.delete(index);
          return next;
        });
      },
      (error: RelayValidationError) => {
        setValidationErrors(prev => {
          const next = new Map(prev);
          next.set(index, error);
          return next;
        });
      }
    )(result);
  };

  const addRelay = () => {
    setTempRelays(prev => [...prev, { url: '', isEditing: true, isNew: true }]);
  };

  const editRelay = (index: number) => () => {
    setTempRelays(prev => {
      const next = [...prev];
      next[index].isEditing = true;
      return next;
    });
  };

  const saveRelay = (index: number) => () => {
    const allUrls = tempRelays.map(r => r.url);
    const result = validateRelayUrl(tempRelays[index].url, allUrls, index);

    match<string, RelayValidationError, void>(
      () => {
        setTempRelays(prev => {
          const next = [...prev];
          next[index].isEditing = false;
          next[index].isNew = false;
          return next;
        });
      },
      (error: RelayValidationError) => {
        setValidationErrors(prev => {
          const next = new Map(prev);
          next.set(index, error);
          return next;
        });
      }
    )(result);
  };

  const removeRelay = (index: number) => () => {
    setTempRelays(prev => prev.filter((_, i) => i !== index));
    setValidationErrors(prev => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  };

  const validateAllRelays = (): Result<string[], RelayValidationError> => {
    return sequence(
      tempRelays.map((relay, index) =>
        validateRelayUrl(
          relay.url,
          tempRelays.map(r => r.url),
          index
        )
      )
    );
  };

  const handleSaveAll = () => {
    const result = validateAllRelays();

    match<string[], RelayValidationError, void>(
      (validUrls: string[]) => {
        gunService.saveRelaySettings(validUrls);
        setShowReloadMessage(true);
        setTimeout(() => {
          setShowReloadMessage(false);
          onClose();
        }, 3000);
      },
      (_error: RelayValidationError) => {
        const allResults = tempRelays.map((relay, index) =>
          validateRelayUrl(
            relay.url,
            tempRelays.map(r => r.url),
            index
          )
        );

        const newErrors = new Map<number, RelayValidationError>();
        allResults.forEach((result, index) => {
          if (isFailure(result)) {
            newErrors.set(index, result.error);
          }
        });
        setValidationErrors(newErrors);
      }
    )(result);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="p-6 space-y-6">
        <h2 className="text-xl font-semibold">Settings</h2>

        <section>
          <h3 className="text-sm font-medium mb-3">UI Options</h3>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map(t => (
              <button
                key={t}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  theme === t
                    ? 'bg-primary text-white'
                    : 'bg-secondary-bg-10 text-foreground-90 hover:bg-secondary-bg-15'
                }`}
                onClick={() => setTheme(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-3">Editor Options</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable syntax highlighting</span>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  editorPreferences.syntaxHighlightingEnabled
                    ? 'bg-primary'
                    : 'bg-secondary'
                }`}
                onClick={() =>
                  setEditorPreference(
                    'syntaxHighlightingEnabled',
                    !editorPreferences.syntaxHighlightingEnabled
                  )
                }
                role="switch"
                aria-checked={editorPreferences.syntaxHighlightingEnabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editorPreferences.syntaxHighlightingEnabled
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-3">Relay Configuration</h3>
          <div className="space-y-3">
            {tempRelays.map((relay, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={relay.url}
                  onChange={e => handleRelayChange(index, e.target.value)}
                  onBlur={() => handleRelayBlur(index)}
                  error={!!validationErrors.get(index)}
                  disabled={!relay.isEditing}
                  className="flex-1"
                  placeholder={relay.isNew ? 'Enter relay URL...' : ''}
                />
                {relay.isEditing ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={saveRelay(index)}
                    >
                      Save
                    </Button>
                    {relay.isNew && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={removeRelay(index)}
                      >
                        ✕
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={editRelay(index)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={removeRelay(index)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            ))}
            {validationErrors.size > 0 && (
              <div className="text-destructive text-sm">
                {[...validationErrors.values()][0].message}
              </div>
            )}
            <Button variant="secondary" className="w-full" onClick={addRelay}>
              + Add Relay
            </Button>
          </div>
        </section>

        <div className="flex justify-between items-center pt-4 border-t">
          {showReloadMessage && (
            <span className="text-sm text-muted-foreground">
              ✓ Saved. Reload page to apply relay changes.
            </span>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAll}
              disabled={validationErrors.size > 0}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
