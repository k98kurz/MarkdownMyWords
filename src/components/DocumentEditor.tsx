import { useState, useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { EditorArea } from './EditorArea';
import { ConfirmModal } from './ConfirmModal';

interface DocumentEditorProps {
  docId?: string;
  onClose?: () => void;
}

export function DocumentEditor({ docId, onClose }: DocumentEditorProps) {
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

  useEffect(() => {
    if (docId) {
      getDocument(docId).then(result => {
        if (result.success && result.data) {
          setTitle(result.data.title || '');
          setContent(result.data.content || '');
          setTags(result.data.tags?.join(', ') || '');
          setIsPublic(result.data.isPublic);
        } else {
          setTitle('');
          setContent('');
          setTags('');
          setIsPublic(false);
        }
      });
    } else {
      setTitle('');
      setContent('');
      setTags('');
      setIsPublic(false);
    }
  }, [docId, getDocument]);

  const handleSave = async () => {
    clearDocError();

    if (docId) {
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

      if (onClose) {
        onClose();
      }
    }
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!docId) {
      return;
    }

    const result = await deleteDocument(docId);
    if (result.success && onClose) {
      onClose();
    }
  };

  if (docId && loadingDocId === docId && !currentDocument) {
    return <div className="loading">Loading document...</div>;
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
            {docId && onClose && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={docStatus === 'SAVING'}
                className="delete"
              >
                Delete
              </button>
            )}
            {onClose && (
              <button type="button" onClick={handleCancel}>
                Cancel
              </button>
            )}
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
