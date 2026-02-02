import { useState, useEffect } from 'react';
import { useDocumentStore } from '../stores/documentStore';

interface DocumentEditorProps {
  docId?: string;
  onClose?: () => void;
}

export function DocumentEditor({ docId, onClose }: DocumentEditorProps) {
  const {
    currentDocument,
    status: docStatus,
    error: docError,
    getDocument,
    createDocument,
    updateDocument,
    clearError: clearDocError,
  } = useDocumentStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (docId) {
      getDocument(docId).then(result => {
        if (result.success && result.data) {
          setTitle(result.data.title || '');
          setContent(result.data.content || '');
          setTags(result.data.tags?.join(', ') || '');
          setIsPublic(result.data.isPublic);
        }
      });
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

  if (docStatus === 'LOADING' && docId && !currentDocument) {
    return <div className="loading">Loading document...</div>;
  }

  return (
    <div className="document-editor">
      <div className="editor-header">
        <h2>{docId ? 'Edit Document' : 'New Document'}</h2>
        {onClose && (
          <button className="close-btn" onClick={handleCancel}>
            Close
          </button>
        )}
      </div>

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
        <div className="form-group">
          <label htmlFor="doc-title">Title</label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Document title"
          />
        </div>

        <div className="form-group">
          <label htmlFor="doc-tags">Tags (comma-separated)</label>
          <input
            id="doc-tags"
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="tag1, tag2, tag3"
          />
        </div>

        {!docId && (
          <div className="form-group checkbox-group">
            <label htmlFor="doc-public">
              <input
                id="doc-public"
                type="checkbox"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
              />
              Public document (not encrypted)
            </label>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="doc-content">Content</label>
          <textarea
            id="doc-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your markdown here..."
            rows={15}
          />
        </div>

        <div className="editor-actions">
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
      </form>
    </div>
  );
}
