import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useParams,
  useNavigate,
  NavigationType,
  useNavigationType,
  useLocation,
} from 'react-router-dom';
import { useDocumentStore } from '@/stores/documentStore';
import { useAuthStore } from '@/stores/authStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useKeyboardShortcutsStore } from '@/stores/keyboardShortcutsStore';
import { EditorArea } from '@/components/EditorArea';
import { ConfirmModal } from '@/components/ConfirmModal';
import { SharingModal } from '@/components/SharingModal';
import { AuthModal } from '@/components/AuthModal';
import { PasswordModal } from '@/components/PasswordModal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Label } from '@/components/ui/Label';
import { TagInput } from '@/components/TagInput';
import { mermaidCache } from '@/lib/cache';

const VIEWER_POLL_INTERVAL_MS = 5000;

/**
 * A permanent condition that makes further viewer polling futile: the
 * document still exists (warm local reads keep succeeding) but the viewer
 * can no longer decrypt or reach its content. Polling stops until the
 * viewer resolves it (re-enter key, log in) or leaves the route.
 */
type ViewerLockout = { kind: 'KEY' | 'AUTH' | 'ACCESS' } | null;

export function DocumentEditor() {
  const { userPub, docId } = useParams<{ userPub?: string; docId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const arrivedViaBackOrDirect = navigationType === NavigationType.Pop;
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const currentUserPub = currentUser?.is?.pub;
  const {
    currentDocument,
    status: docStatus,
    loadingDocId,
    error: docError,
    getDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    clearDocumentMetadata,
    clearError: clearDocError,
    getDocumentKey,
  } = useDocumentStore();

  const isConnected = useConnectionStore(s => s.isConnected);

  const registerShortcut = useKeyboardShortcutsStore(s => s.registerShortcut);
  const unregisterShortcut = useKeyboardShortcutsStore(
    s => s.unregisterShortcut
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sharingDoc, setSharingDoc] = useState<{
    docId: string;
    userPub: string;
    docKey?: string;
  } | null>(null);
  const [keyError, setKeyError] = useState<string | undefined>();
  type ViewError =
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'AUTH_REQUIRED'
    | undefined;
  const [viewError, setViewError] = useState<ViewError>(undefined);
  const [cameFromNewDoc, setCameFromNewDoc] = useState(false);

  /**
   * Key (`${userPub}/${docId}`) of the load currently in flight, or null.
   * Keyed so a load started for a newer document is never cleared by the
   * settle of an older one, and runAutoRetry never fires a parallel read
   * behind an unresolved load.
   */
  const loadInFlightRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  /**
   * Password/key used to unlock the current document via PasswordModal, when
   * key-based access was needed. Viewer polling reuses it so a private doc
   * opened with a key keeps refreshing without re-prompting the viewer.
   */
  const providedKeyRef = useRef<string | null>(null);
  /**
   * True when a viewer poll has confirmed the document is gone (owner
   * deleted it or revoked access) while its last version is still on
   * screen. The banner lets the viewer close instead of waiting for a
   * refresh that will never come. Warm null reads are decisive, so this
   * also stops polling until the route changes.
   */
  const [docUnavailable, setDocUnavailable] = useState(false);
  /**
   * Set by a viewer poll whose failure is permanent rather than transient:
   * KEY = the stashed password/key no longer decrypts (owner rotated it),
   * AUTH = the document went private while the viewer is logged out,
   * ACCESS = the logged-in viewer lost key-slot access. A later poll
   * cannot recover from these (see ViewerLockout), so polling halts and
   * the banner explains what happened and how to recover.
   */
  const [viewerLockout, setViewerLockout] = useState<ViewerLockout>(null);
  /**
   * One automatic re-read per connection cycle. Consumed when the retry
   * fires; reset when the relay disconnects, the document route changes, or
   * the user logs in — so a genuinely missing document settles stably after
   * exactly one confirming re-read instead of retrying forever.
   */
  const [autoRetryUsed, setAutoRetryUsed] = useState(false);
  const prevIsAuthenticated = useRef(isAuthenticated);

  const applyGetResult = useCallback(
    (
      docIdArg: string,
      docPubArg: string,
      providedKeyArg?: string,
      silentArg?: boolean
    ) => {
      const inFlightKey = `${docPubArg}/${docIdArg}`;
      // Silent (viewer poll) and explicit loads share the same latch so a
      // poll never races the initial load, an auto-retry, or another poll,
      // but a silent run never paints error screens or resets fields.
      if (loadInFlightRef.current) {
        return;
      }
      if (!silentArg) {
        // A load in progress is authoritative over any prior error screen;
        // without this the stale NOT_FOUND renders during the retried read.
        setViewError(undefined);
      }
      loadInFlightRef.current = inFlightKey;
      return getDocument(docIdArg, docPubArg, providedKeyArg, {
        silent: silentArg,
      })
        .then(result => {
          if (silentArg) {
            if (result.success && result.data) {
              // Fresh version arrived; the banner is no longer accurate.
              setDocUnavailable(false);
            } else if (result.success && result.data === null) {
              // Poll confirmed the doc is gone; keep the stale view and let
              // the banner explain it.
              setDocUnavailable(true);
            } else if (!result.success) {
              // Warm local reads mean failures here are either transient
              // (network/storage — ignored) or permanent (access lost —
              // no later poll can recover, so stop polling and explain).
              const code = result.error.code;
              if (code === 'ENCRYPTION_ERROR') {
                setViewerLockout({ kind: 'KEY' });
              } else if (code === 'AUTH_REQUIRED') {
                setViewerLockout({ kind: 'AUTH' });
              } else if (code === 'PERMISSION_DENIED') {
                setViewerLockout({ kind: 'ACCESS' });
              }
            }
            return;
          }
          if (result.success && result.data) {
            setTitle(result.data.title || '');
            setContent(result.data.content || '');
            setTags(result.data.tags ? [...result.data.tags].sort() : []);
            setIsPublic(result.data.isPublic);
            setViewError(undefined);
          } else if (!result.success) {
            setTitle('');
            setContent('');
            setTags([]);
            setIsPublic(false);
            if (result.error.code === 'NOT_FOUND') {
              setViewError('NOT_FOUND');
            } else if (result.error.code === 'PERMISSION_DENIED') {
              setViewError('PERMISSION_DENIED');
            } else if (result.error.code === 'AUTH_REQUIRED') {
              setViewError('AUTH_REQUIRED');
            }
          } else if (result.success && result.data === null) {
            setTitle('');
            setContent('');
            setTags([]);
            setIsPublic(false);
            setViewError('NOT_FOUND');
          }
        })
        .finally(() => {
          if (loadInFlightRef.current === inFlightKey) {
            loadInFlightRef.current = null;
          }
        });
    },
    [getDocument]
  );

  const runAutoRetry = useCallback(() => {
    if (loadInFlightRef.current || autoRetryUsed) {
      return;
    }
    setAutoRetryUsed(true);
    void applyGetResult(docId as string, userPub as string);
  }, [applyGetResult, autoRetryUsed, docId, userPub]);

  useEffect(() => {
    mermaidCache.clear();
    setAutoRetryUsed(false);
    providedKeyRef.current = null;
    setDocUnavailable(false);
    setViewerLockout(null);

    const state = location.state as { title?: string; content?: string } | null;

    if (docId && docId !== 'new' && userPub) {
      applyGetResult(docId, userPub);
    } else if (
      (docId === 'new' || docId === undefined) &&
      state?.title &&
      state?.content
    ) {
      setTitle(state.title);
      setContent(state.content);
      setTags([]);
      setIsPublic(false);
      setViewError(undefined);
    } else if (docId === 'new') {
      setTitle('');
      setContent('');
      setTags([]);
      setIsPublic(false);
      setViewError(undefined);
    } else if (!(userPub === undefined && docId === undefined)) {
      setTitle('');
      setContent('');
      setTags([]);
      setIsPublic(false);
      setViewError('NOT_FOUND');
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setIsPublic(false);
      setViewError(undefined);
    }
  }, [docId, userPub, applyGetResult, location.state]);

  /**
   * Automatic recovery when a load failed prematurely (fresh browser still
   * syncing with the relay, or a wire/deadline timeout while reconnecting).
   *
   * Re-runs the load when the error state is present and the relay is up,
   * bounded by the autoRetryUsed latch: one re-read per connection cycle.
   * A login transition also resets the latch and retries AUTH_ERROR and
   * NOT_FOUND error states, since documents that require auth fail until the
   * user authenticates. A load already in flight (loadInFlightRef) blocks
   * re-entry, so the trigger cannot race the initial or in-progress read.
   */
  useEffect(() => {
    const wasAuthenticated = prevIsAuthenticated.current;
    prevIsAuthenticated.current = isAuthenticated;

    if (!isConnected) {
      setAutoRetryUsed(false);
      return;
    }

    if (!(docId && docId !== 'new' && userPub) || currentDocument) {
      return;
    }

    const hasAnyError = !!viewError || !!docError;
    const hasTransientError =
      viewError === 'NOT_FOUND' || (!viewError && !!docError);
    // An authenticated user seeing AUTH_REQUIRED is contradictory: the
    // earlier read must have run before login completed.
    const authRecoverable = isAuthenticated && viewError === 'AUTH_REQUIRED';
    const authEdge = isAuthenticated && !wasAuthenticated;

    if (authEdge) {
      setAutoRetryUsed(false);
    }

    if (
      ((hasTransientError || authRecoverable) && !autoRetryUsed) ||
      (authEdge && hasAnyError)
    ) {
      runAutoRetry();
    }
  }, [
    isConnected,
    isAuthenticated,
    viewError,
    docError,
    docId,
    userPub,
    currentDocument,
    autoRetryUsed,
    runAutoRetry,
  ]);

  const canEdit = !userPub || userPub === currentUserPub;
  // A route with no loadable document (no userPub) can never recover;
  // retry-eligible routes get connection-aware copy and auto-retry instead.
  const retryEligible = !!docId && docId !== 'new' && !!userPub;

  /**
   * Clearing an AUTH lockout once the viewer is authenticated — the poll
   * would then read through the viewer's own key store, so it is no longer
   * futile. KEY/ACCESS lockouts recover only via re-entering the key
   * (PasswordModal success) or leaving the route.
   */
  const authLockoutActive = viewerLockout?.kind === 'AUTH';
  useEffect(() => {
    if (isAuthenticated && authLockoutActive) {
      setViewerLockout(null);
    }
  }, [isAuthenticated, authLockoutActive]);

  /**
   * Live updates for viewers (read-only access to someone else's document):
   * refresh the displayed doc on a fixed interval so saves by the author
   * appear without a page reload. Silent store reads keep transient relay
   * failures invisible, and the in-flight latch (loadInFlightRef) prevents a
   * poll from overlapping the initial load, an auto-retry, or another poll.
   * Gated on the relay connection; the auto-retry effect above covers the
   * reconnect path, and polling resumes as soon as isConnected flips true.
   *
   * Also gated on currentDocument being set: polls only run warm (the doc
   * already lives in the local database), because behind an unresolved
   * error screen a cold poll cannot bootstrap the view — the silent store
   * path refuses to clobber an empty currentDocument — so those reads are
   * pure waste. And gated on the absence of a lockout, since a permanent
   * access failure makes every further poll futile — likewise on a confirmed
   * deletion (null poll), which is equally terminal: warm reads make null
   * decisive, so further polls are pure waste.
   */
  const hasDocument = !!currentDocument;
  useEffect(() => {
    if (
      !isConnected ||
      canEdit ||
      !retryEligible ||
      !hasDocument ||
      viewerLockout ||
      docUnavailable
    ) {
      return;
    }

    const pollInterval = setInterval(() => {
      if (loadInFlightRef.current) {
        return;
      }
      void applyGetResult(
        docId as string,
        userPub as string,
        providedKeyRef.current ?? undefined,
        true
      );
    }, VIEWER_POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [
    isConnected,
    canEdit,
    retryEligible,
    hasDocument,
    viewerLockout,
    docUnavailable,
    applyGetResult,
    docId,
    userPub,
  ]);

  const handleDownload = () => {
    const currentTitle =
      title || (docId && docId !== 'new' ? docId : 'untitled');
    const safeTitle = currentTitle.replace(/[^a-z0-9_-]/gi, '_');
    let filename;

    if (title && title.toLowerCase() !== 'untitled') {
      filename = `${safeTitle}.md`;
    } else if (docId && docId !== 'new') {
      const timestamp = Date.now();
      filename = `MMW-${docId}-${timestamp}.md`;
    } else {
      const timestamp = Date.now();
      filename = `MMW-untitled-${timestamp}.md`;
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = useCallback(async () => {
    if (saveInFlightRef.current) {
      return;
    }
    saveInFlightRef.current = true;

    try {
      clearDocError();

      if (docId && docId !== 'new') {
        const result = await updateDocument(docId, {
          title: title || 'Untitled',
          content: content || '',
          tags: tags.length > 0 ? tags : undefined,
        });

        if (!result.success) {
          return;
        }

        clearDocumentMetadata(docId);
      } else {
        const result = await createDocument(
          title || 'Untitled',
          content || '',
          tags.length > 0 ? tags : undefined,
          isPublic
        );

        if (!result.success) {
          return;
        }

        setCameFromNewDoc(true);
        navigate(`/doc/${currentUserPub}/${result.data.id}`);
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }, [
    clearDocError,
    docId,
    updateDocument,
    title,
    content,
    tags,
    clearDocumentMetadata,
    createDocument,
    isPublic,
    currentUserPub,
    navigate,
  ]);

  const handleShareClick = async () => {
    if (!currentDocument) return;

    const sharingData = {
      docId: currentDocument.id,
      userPub: currentUserPub!,
    };

    if (!currentDocument.isPublic) {
      const keyResult = await getDocumentKey(currentDocument.id);
      if (keyResult.success && keyResult.data) {
        setSharingDoc({
          ...sharingData,
          docKey: keyResult.data,
        });
        setShowSharingModal(true);
      }
    } else {
      setSharingDoc(sharingData);
      setShowSharingModal(true);
    }
  };

  const handleCancel = () => {
    handleBackwardNavigation();
  };

  const handleBackwardNavigation = () => {
    if (arrivedViaBackOrDirect) {
      navigate('/');
    } else if (cameFromNewDoc) {
      navigate('/docs');
      setCameFromNewDoc(false);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleDelete = async () => {
    if (!docId || docId === 'new') {
      return;
    }

    const result = await deleteDocument(docId);
    if (result.success) {
      handleBackwardNavigation();
    }
  };

  useEffect(() => {
    if (canEdit) {
      registerShortcut(
        'ctrl+s',
        'document-editor',
        'Save document',
        handleSave,
        0
      );
      registerShortcut(
        'meta+s',
        'document-editor',
        'Save document',
        handleSave,
        0
      );
      return () => {
        unregisterShortcut('ctrl+s', 'document-editor');
        unregisterShortcut('meta+s', 'document-editor');
      };
    }
  }, [canEdit, handleSave, registerShortcut, unregisterShortcut]);

  /**
   * A premature failure on a retry-eligible route with retry budget left.
   * Painted as the loading view so the error screen never appears between
   * the connect transition and the retry starting (which is the flash).
   */
  const waitingForRecovery =
    retryEligible &&
    isConnected &&
    !currentDocument &&
    !autoRetryUsed &&
    (viewError === 'NOT_FOUND' || (!viewError && !!docError));

  if (
    (docId && loadingDocId === docId && !currentDocument && !viewError) ||
    waitingForRecovery
  ) {
    return (
      <div className="px-8 py-16 text-center text-lg">Loading document...</div>
    );
  }

  if (viewError) {
    let title = 'Access Denied';
    let description = 'An error occurred.';
    let actions = <Button onClick={() => navigate('/')}>Home</Button>;

    if (viewError === 'NOT_FOUND') {
      if (retryEligible && !isConnected) {
        title = 'Still Connecting';
        description =
          'The document was not found in the local database, and the relay ' +
          'connection is not up yet. After connecting, if the document can ' +
          'be retrieved, it will be.';
      } else {
        title = 'Document Not Found';
        description = "The document you're looking for doesn't exist.";
      }
    } else if (
      viewError === 'PERMISSION_DENIED' ||
      viewError === 'AUTH_REQUIRED'
    ) {
      title =
        viewError === 'AUTH_REQUIRED'
          ? 'Authentication Required'
          : 'Permission Denied';
      description =
        viewError === 'AUTH_REQUIRED'
          ? 'Please log in to access this document.'
          : 'You do not have access to this document.';

      actions = (
        <div className="flex gap-2">
          {isAuthenticated && (
            <Button onClick={() => navigate('/')}>Home</Button>
          )}
          {!isAuthenticated && (
            <Button variant="primary" onClick={() => setShowAuthModal(true)}>
              Log In
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setShowPasswordModal(true)}
          >
            Password/key
          </Button>
        </div>
      );
    }

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <h1 className="mb-4 text-2xl font-bold text-card-foreground">
          {title}
        </h1>
        <p className="mb-8 text-muted-foreground">{description}</p>
        <div className="flex gap-4">{actions}</div>

        <PasswordModal
          isOpen={showPasswordModal}
          onClose={() => {
            setShowPasswordModal(false);
            setKeyError(undefined);
          }}
          onSubmit={async password => {
            setKeyError(undefined);
            const result = await getDocument(docId!, userPub!, password);
            if (!result.success) {
              setKeyError('Invalid password or key');
            } else if (result.data) {
              // Stashed so viewer polling can keep refreshing this private
              // doc without re-prompting for the key.
              providedKeyRef.current = password;
              setTitle(result.data.title || '');
              setContent(result.data.content || '');
              setTags(result.data.tags ? [...result.data.tags].sort() : []);
              setIsPublic(result.data.isPublic);
              setViewError(undefined);
              setShowPasswordModal(false);
            }
          }}
          error={keyError}
        />
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </div>
    );
  }

  if (!canEdit && !viewError && currentDocument) {
    return (
      <div className="flex flex-col gap-4">
        {docUnavailable && (
          <div className="rounded-md bg-rose-500/10 p-4 text-rose-500 border border-rose-500/20">
            <p>This document is no longer available.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackwardNavigation}
            >
              Close
            </Button>
          </div>
        )}
        {viewerLockout && (
          <div className="rounded-md bg-amber-500/10 p-4 text-amber-600 border border-amber-500/20">
            <p>
              {viewerLockout.kind === 'KEY' &&
                'Your password/key no longer unlocks this document — it has probably been changed. The view below is a stale copy.'}
              {viewerLockout.kind === 'AUTH' &&
                'This document is now private and you are logged out. The view below is a stale copy.'}
              {viewerLockout.kind === 'ACCESS' &&
                'You no longer have access to this document. The view below is a stale copy.'}
            </p>
            <div className="flex gap-2">
              {viewerLockout.kind === 'KEY' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPasswordModal(true)}
                >
                  Re-enter key
                </Button>
              )}
              {viewerLockout.kind === 'AUTH' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAuthModal(true)}
                >
                  Log In
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackwardNavigation}
              >
                Close
              </Button>
            </div>
            <PasswordModal
              isOpen={showPasswordModal}
              onClose={() => {
                setShowPasswordModal(false);
                setKeyError(undefined);
              }}
              onSubmit={async password => {
                setKeyError(undefined);
                const result = await getDocument(docId!, userPub!, password, {
                  silent: true,
                });
                if (!result.success) {
                  setKeyError('Invalid password or key');
                } else if (result.data && currentDocument?.id === docId) {
                  // Refresh the on-screen doc with the new key directly and
                  // stash it so polling can continue without re-prompting.
                  providedKeyRef.current = password;
                  setTitle(result.data.title || '');
                  setContent(result.data.content || '');
                  setTags(result.data.tags ? [...result.data.tags].sort() : []);
                  setIsPublic(result.data.isPublic);
                  setViewerLockout(null);
                  setShowPasswordModal(false);
                } else {
                  setKeyError('Invalid password or key');
                }
              }}
              error={keyError}
            />
            <AuthModal
              isOpen={showAuthModal}
              onClose={() => setShowAuthModal(false)}
            />
          </div>
        )}
        <div className="rounded-lg border border-border-20 bg-card mb-7">
          <div className="min-h-[70vh]">
            <EditorArea
              title={currentDocument.title}
              content={currentDocument.content}
              onContentChange={() => {}}
              onTitleChange={() => {}}
              enableViewSwitch={true}
              defaultViewMode="preview"
              isReadOnly={true}
              onDownload={handleDownload}
            />
          </div>

          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end">
            <div className="w-full lg:flex-1">
              <Label htmlFor="doc-tags">Tags:</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {currentDocument.tags && currentDocument.tags.length > 0 ? (
                  currentDocument.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No tags</span>
                )}
              </div>
            </div>

            <div className="flex flex-col w-full gap-2 sm:flex-row sm:items-center sm:gap-4 sm:w-auto lg:ml-4">
              <span className="text-sm text-muted-foreground">Read Only</span>

              <Button
                variant="secondary"
                type="button"
                onClick={handleBackwardNavigation}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {docError && (
        <div className="rounded-md bg-rose-500/10 p-4 text-rose-500 border border-rose-500/20">
          <p>{docError}</p>
          <Button variant="ghost" size="sm" onClick={clearDocError}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border-20 bg-card mb-7">
        <div className="min-h-[70vh]">
          <EditorArea
            title={title}
            content={content}
            onContentChange={setContent}
            onTitleChange={setTitle}
            enableViewSwitch={true}
            defaultViewMode="edit"
            isReadOnly={false}
            onDownload={handleDownload}
          />
        </div>

        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-4 lg:flex-1">
            <div className="w-full lg:flex-1 lg:min-w-[400px]">
              <TagInput tags={tags} onChange={setTags} />
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
              {docId && docId !== 'new' && (
                <Button
                  variant="danger"
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={docStatus === 'SAVING'}
                  className="w-full sm:w-auto order-last sm:order-none"
                >
                  Delete
                </Button>
              )}
              <Button
                variant="secondary"
                type="button"
                onClick={handleCancel}
                className="w-full sm:w-auto"
              >
                {!docId || docId === 'new' ? 'Cancel' : 'Close'}
              </Button>
              {docId && docId !== 'new' && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleShareClick}
                  className="w-full sm:w-auto"
                >
                  Sharing/Privacy
                </Button>
              )}
              <Button
                variant="primary"
                type="button"
                onClick={handleSave}
                disabled={docStatus === 'SAVING'}
                isLoading={docStatus === 'SAVING'}
                className="w-full sm:w-auto order-first sm:order-none"
              >
                Save
              </Button>
            </div>
          )}
        </div>
      </div>

      {sharingDoc && (
        <SharingModal
          isOpen={showSharingModal}
          onClose={() => {
            setShowSharingModal(false);
            setSharingDoc(null);
          }}
          docId={sharingDoc.docId}
          userPub={sharingDoc.userPub}
          isPublic={isPublic}
          docKey={sharingDoc.docKey}
        />
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
        isDangerous
      />
    </div>
  );
}
