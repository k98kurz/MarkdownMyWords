import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '@/stores/documentStore';
import { useAuthStore } from '@/stores/authStore';
import { EditorArea } from '@/components/EditorArea';
import { ConfirmModal } from '@/components/ConfirmModal';
import { SharingModal } from '@/components/SharingModal';
import { AuthModal } from '@/components/AuthModal';
import { PrivacySettingsModal } from '@/components/PrivacySettingsModal';
import { PasswordModal } from '@/components/PasswordModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { mermaidCache } from '@/lib/cache';

export function DocumentEditor() {
  const { userPub, docId } = useParams<{ userPub?: string; docId?: string }>();
  const navigate = useNavigate();
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

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [sharingDoc, setSharingDoc] = useState<{
    docId: string;
    userPub: string;
    isPublic: boolean;
    docKey?: string;
  } | null>(null);
  const [keyError, setKeyError] = useState<string | undefined>();
  type ViewError =
    | 'NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'AUTH_REQUIRED'
    | undefined;
  const [viewError, setViewError] = useState<ViewError>(undefined);

  useEffect(() => {
    mermaidCache.clear();

    if (docId && docId !== 'new' && userPub) {
      getDocument(docId, userPub).then(result => {
        if (result.success && result.data) {
          setTitle(result.data.title || '');
          setContent(result.data.content || '');
          setTags(result.data.tags?.join(', ') || '');
          setIsPublic(result.data.isPublic);
          setViewError(undefined);
        } else if (!result.success) {
          setTitle('');
          setContent('');
          setTags('');
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
          setTags('');
          setIsPublic(false);
          setViewError('NOT_FOUND');
        }
      });
    } else if (!(userPub === undefined && docId === undefined)) {
      setTitle('');
      setContent('');
      setTags('');
      setIsPublic(false);
      setViewError('NOT_FOUND');
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setIsPublic(false);
      setViewError(undefined);
    }
  }, [docId, userPub, getDocument]);

  const handleSave = async () => {
    clearDocError();

    if (docId && docId !== 'new') {
      const result = await updateDocument(docId, {
        title: title || 'Untitled',
        content: content || '',
        tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
      });

      if (!result.success) {
        return;
      }

      clearDocumentMetadata(docId);
    } else {
      const result = await createDocument(
        title || 'Untitled',
        content || '',
        tags ? tags.split(',').map(t => t.trim()) : undefined,
        isPublic
      );

      if (!result.success) {
        return;
      }

      navigate(`/doc/${currentUserPub}/${result.data.id}`);
    }
  };

  const handleShareClick = async () => {
    if (!currentDocument) return;

    const sharingData = {
      docId: currentDocument.id,
      userPub: currentUserPub!,
      isPublic: currentDocument.isPublic,
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

  const handleOpenPrivacySettings = () => {
    setShowPrivacySettings(true);
  };

  const handleCancel = () => {
    navigate('/docs');
  };

  const handleDelete = async () => {
    if (!docId || docId === 'new') {
      return;
    }

    const result = await deleteDocument(docId);
    if (result.success) {
      navigate('/docs');
    }
  };

  if (docId && loadingDocId === docId && !currentDocument && !viewError) {
    return (
      <div className="px-8 py-16 text-center text-lg">Loading document...</div>
    );
  }

  if (viewError) {
    let title = 'Access Denied';
    let description = 'An error occurred.';
    let actions = (
      <Button onClick={() => navigate('/docs')}>Go to Documents</Button>
    );

    if (viewError === 'NOT_FOUND') {
      title = 'Document Not Found';
      description = "The document you're looking for doesn't exist.";
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
            <Button onClick={() => navigate('/docs')}>Go to Documents</Button>
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
              setTitle(result.data.title || '');
              setContent(result.data.content || '');
              setTags(result.data.tags?.join(', ') || '');
              setIsPublic(result.data.isPublic);
              setViewError(undefined);
              setShowPasswordModal(false);
            }
          }}
          error={keyError}
        />
      </div>
    );
  }

  const canEdit = !userPub || userPub === currentUserPub;

  if (!canEdit && !viewError && currentDocument) {
    return (
      <div className="flex flex-col gap-4">
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
                onClick={() => navigate('/docs')}
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

      <form
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
      >
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
            />
          </div>

          <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-4 lg:flex-1">
              <div className="w-full lg:flex-1 lg:min-w-[400px]">
                <Label htmlFor="doc-tags">Tags:</Label>
                <Input
                  id="doc-tags"
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="tag1, tag2, tag3"
                />
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
                    className="w-full sm:w-auto"
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
                    Sharing
                  </Button>
                )}
                <Button
                  variant="primary"
                  type="submit"
                  disabled={docStatus === 'SAVING'}
                  isLoading={docStatus === 'SAVING'}
                  className="w-full sm:w-auto"
                >
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </form>

      {sharingDoc && (
        <SharingModal
          isOpen={showSharingModal}
          onClose={() => {
            setShowSharingModal(false);
            setSharingDoc(null);
          }}
          docId={sharingDoc.docId}
          userPub={sharingDoc.userPub}
          isPublic={sharingDoc.isPublic}
          docKey={sharingDoc.docKey}
          onOpenPrivacySettings={handleOpenPrivacySettings}
        />
      )}

      <PrivacySettingsModal
        isOpen={showPrivacySettings}
        onClose={() => setShowPrivacySettings(false)}
        docId={docId!}
        currentIsPublic={isPublic}
      />

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
