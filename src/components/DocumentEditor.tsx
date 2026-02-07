import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { useAuthStore } from '../stores/authStore';
import { EditorArea } from './EditorArea';
import { ConfirmModal } from './ConfirmModal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Badge } from './ui/Badge';

export function DocumentEditor() {
  const { userPub, docId } = useParams<{ userPub?: string; docId?: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
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
  } = useDocumentStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  type ViewError = 'NOT_FOUND' | 'PERMISSION_DENIED' | undefined;
  const [viewError, setViewError] = useState<ViewError>(undefined);

  useEffect(() => {
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
          }
        } else if (result.success && result.data === null) {
          setTitle('');
          setContent('');
          setTags('');
          setIsPublic(false);
          setViewError('NOT_FOUND');
        }
      });
    } else if (docId !== 'new') {
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
    const title =
      viewError === 'NOT_FOUND' ? 'Document Not Found' : 'Permission Denied';
    const description =
      viewError === 'NOT_FOUND'
        ? "The document you're looking for doesn't exist."
        : 'You do not have access to this document.';

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <h1 className="mb-4 text-2xl font-bold text-card-foreground">
          {title}
        </h1>
        <p className="mb-8 text-muted-foreground">{description}</p>
        <Button onClick={() => navigate('/docs')}>Go to Documents</Button>
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

          <div className="flex flex-wrap items-end gap-4 p-4">
            <div className="flex-1 min-w-[200px]">
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

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Read Only</span>

              <Button
                variant="secondary"
                type="button"
                onClick={() => navigate('/docs')}
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

          <div className="flex flex-wrap items-end gap-4 p-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="doc-tags">Tags:</Label>
              <Input
                id="doc-tags"
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <div className="min-w-[180px]">
              <Label htmlFor="doc-privacy">Privacy:</Label>
              <select
                id="doc-privacy"
                value={isPublic ? 'public' : 'private'}
                onChange={e => setIsPublic(e.target.value === 'public')}
                className="w-full rounded-md border border-border-20 bg-select-bg-8 px-3 py-2 text-sm text-foreground-87 focus:border-primary-500 focus:outline-none focus:bg-select-bg-10 focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="private">Private (encrypted)</option>
                <option value="public">Public (not encrypted)</option>
              </select>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                {docId && docId !== 'new' && (
                  <Button
                    variant="danger"
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={docStatus === 'SAVING'}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleCancel}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={docStatus === 'SAVING'}
                  isLoading={docStatus === 'SAVING'}
                >
                  Save
                </Button>
              </div>
            )}
          </div>
        </div>
      </form>

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
