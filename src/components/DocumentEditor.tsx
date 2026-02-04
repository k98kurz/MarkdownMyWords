import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { EditorArea } from './EditorArea';
import { ConfirmModal } from './ConfirmModal';

export function DocumentEditor() {
  const { docId } = useParams<{ docId?: string }>();
  const navigate = useNavigate();
  const {
    currentDocument,
    status: docStatus,
    loadingDocId,
    error: docError,
    getDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    clearError: clearDocError,
  } = useDocumentStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (docId && docId !== 'new') {
      getDocument(docId).then(result => {
        if (result.success && result.data) {
          setTitle(result.data.title || '');
          setContent(result.data.content || '');
          setTags(result.data.tags?.join(', ') || '');
          setIsPublic(result.data.isPublic);
          setNotFound(false);
        } else {
          setTitle('');
          setContent('');
          setTags('');
          setIsPublic(false);
          setNotFound(true);
        }
      });
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setIsPublic(false);
      setNotFound(false);
    }
  }, [docId, getDocument]);

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

      navigate('/docs');
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

  if (docId && loadingDocId === docId && !currentDocument && !notFound) {
    return <div className="loading">Loading document...</div>;
  }

  if (notFound) {
    return (
      <div className="not-found">
        <h1>Document Not Found</h1>
        <p>The document you're looking for doesn't exist.</p>
        <button onClick={() => navigate('/docs')} className="primary">
          Go to Documents
        </button>
      </div>
    );
  }

  return (
    <div className="document-editor">
      {docError && (
        <div className="error">
          <p>{docError}</p>
          <button onClick={clearDocError}>Dismiss</button>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
      >
        <div className="form-group editor-group">
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

        <div className="tags-and-actions">
          <div className="form-group form-group--inline">
            <label htmlFor="doc-tags">Tags:</label>
            <input
              id="doc-tags"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3"
            />
          </div>

          <div className="form-group form-group--inline privacy-dropdown">
            <label htmlFor="doc-privacy">Privacy:</label>
            <select
              id="doc-privacy"
              value={isPublic ? 'public' : 'private'}
              onChange={e => setIsPublic(e.target.value === 'public')}
            >
              <option value="private">Private (encrypted)</option>
              <option value="public">Public (not encrypted)</option>
            </select>
          </div>

          <div className="editor-actions">
            {docId && docId !== 'new' && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={docStatus === 'SAVING'}
                className="delete"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={docStatus === 'SAVING'}
              className="primary"
            >
              {docStatus === 'SAVING' ? 'Saving...' : 'Save'}
            </button>
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
