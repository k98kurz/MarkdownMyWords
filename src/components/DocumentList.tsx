import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { ConfirmModal } from './ConfirmModal';

export function DocumentList() {
  const {
    documentList,
    status,
    error,
    loadedMetadata,
    enrichedDocs,
    getDocumentMetadata,
    clearError,
    listDocuments,
    deleteDocument,
    setLoadedMetadata,
    setDocumentMetadata,
  } = useDocumentStore();

  const [loadingMetadata, setLoadingMetadata] = useState<Set<string>>(
    new Set()
  );
  const [metadataErrors, setMetadataErrors] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | undefined>(undefined);
  const hasLoadedList = useRef(false);

  const loadDocumentMetadata = useCallback(
    async (docId: string) => {
      setLoadingMetadata((prev: Set<string>) => new Set(prev).add(docId));

      try {
        const result = await getDocumentMetadata(docId);

        if (result.success && result.data) {
          setLoadedMetadata(docId);
          setDocumentMetadata(docId, result.data.title, result.data.tags);
        }
      } catch {
        setMetadataErrors((prev: Set<string>) => new Set(prev).add(docId));
      } finally {
        setLoadingMetadata((prev: Set<string>) => {
          const newSet = new Set(prev);
          newSet.delete(docId);
          return newSet;
        });
      }
    },
    [getDocumentMetadata, setLoadedMetadata, setDocumentMetadata]
  );

  useEffect(() => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const docId = entry.target.getAttribute('data-doc-id');
              if (
                docId &&
                !loadedMetadata.has(docId) &&
                !loadingMetadata.has(docId)
              ) {
                loadDocumentMetadata(docId);
              }
            }
          });
        },
        { threshold: 0.1, rootMargin: '100px' }
      );
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadedMetadata, loadingMetadata, loadDocumentMetadata]);

  // Load documents when component mounts (e.g., when navigating back to /docs)
  useEffect(() => {
    if (!hasLoadedList.current) {
      hasLoadedList.current = true;
      listDocuments().catch(err => {
        if (err.code !== 'NETWORK_ERROR') {
          console.error('Failed to list documents:', err);
        }
      });
    }
  }, [listDocuments]);

  const handleRetry = () => {
    clearError();
    listDocuments();
  };

  const handleDelete = (docId: string) => {
    setDocToDelete(docId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;
    const result = await deleteDocument(docToDelete);
    if (result.success) {
      await listDocuments();
      setDocToDelete(undefined);
      setShowDeleteConfirm(false);
    }
  };

  const setItemRef = (docId: string, element: HTMLLIElement | null) => {
    if (element) {
      itemRefs.current.set(docId, element);
      if (observerRef.current) {
        observerRef.current.observe(element);
      }
    } else {
      const el = itemRefs.current.get(docId);
      if (el && observerRef.current) {
        observerRef.current.unobserve(el);
      }
      itemRefs.current.delete(docId);
    }
  };

  if (status === 'LOADING' && documentList.length === 0) {
    return <div className="loading">Loading documents...</div>;
  }

  if (error && documentList.length === 0) {
    return (
      <div className="error">
        <p>{error}</p>
        <button onClick={handleRetry}>Retry</button>
      </div>
    );
  }

  if (documentList.length === 0) {
    return (
      <div className="empty-state">
        <p>No documents yet. Create your first document!</p>
        <Link to="/doc/new" className="create-button">
          Create New Document
        </Link>
      </div>
    );
  }

  return (
    <div className="document-list">
      <div className="document-list-header">
        <h2>Your Documents</h2>
        <Link to="/doc/new" className="create-button">
          Create New Document
        </Link>
      </div>
      <ul>
        {documentList.map(doc => (
          <li
            key={doc.docId}
            data-doc-id={doc.docId}
            ref={el => setItemRef(doc.docId, el)}
            className="document-item"
          >
            {loadingMetadata.has(doc.docId) ? (
              <div className="document-item-main">
                <div className="loading-meta">Loading...</div>
              </div>
            ) : metadataErrors.has(doc.docId) ? (
              <div className="document-item-main">
                <div className="document-item-header">
                  <strong className="document-title document-title--error">
                    Error loading doc metadata
                  </strong>
                  <span className="doc-meta">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="document-item-main">
                  <div className="document-item-header">
                    <strong className="document-title">
                      {enrichedDocs.get(doc.docId)?.title || 'Untitled'}
                    </strong>
                    <span className="doc-meta">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {(() => {
                    const tags = enrichedDocs.get(doc.docId)?.tags;
                    if (tags && tags.length > 0) {
                      return (
                        <div className="document-tags">
                          {tags.map(tag => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="document-item-actions">
                  <Link
                    to={`/doc/${doc.docId}`}
                    className="action-button action-button--primary"
                  >
                    Open
                  </Link>
                  <button className="action-button action-button--secondary">
                    Sharing
                  </button>
                  <button
                    className="action-button action-button--danger"
                    onClick={() => handleDelete(doc.docId)}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Document"
        message="Are you sure you want to delete this document? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDocToDelete(undefined);
        }}
        isDangerous
      />
    </div>
  );
}
