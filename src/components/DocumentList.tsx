import { useEffect, useState, useRef, useCallback } from 'react';
import { useDocumentStore } from '../stores/documentStore';

interface DocumentListProps {
  onDocumentSelect?: (docId: string) => void;
  onCreateNew?: () => void;
}

export function DocumentList({
  onDocumentSelect,
  onCreateNew,
}: DocumentListProps) {
  const {
    documentList,
    status,
    error,
    getDocumentMetadata,
    clearError,
    listDocuments,
  } = useDocumentStore();

  const [loadedMetadata, setLoadedMetadata] = useState<Set<string>>(new Set());
  const [loadingMetadata, setLoadingMetadata] = useState<Set<string>>(
    new Set()
  );
  const [enrichedDocs, setEnrichedDocs] = useState<
    Map<string, { title?: string; tags?: string[] }>
  >(new Map());
  const [metadataErrors, setMetadataErrors] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const loadDocumentMetadata = useCallback(
    async (docId: string) => {
      setLoadingMetadata(prev => new Set(prev).add(docId));

      try {
        const result = await getDocumentMetadata(docId);

        if (result.success && result.data) {
          setLoadedMetadata(prev => new Set(prev).add(docId));
          setEnrichedDocs(prev =>
            new Map(prev).set(docId, {
              title: result.data.title,
              tags: result.data.tags,
            })
          );
        }
      } catch (error) {
        setMetadataErrors(prev => new Set(prev).add(docId));
      } finally {
        setLoadingMetadata(prev => {
          const newSet = new Set(prev);
          newSet.delete(docId);
          return newSet;
        });
      }
    },
    [getDocumentMetadata]
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

  const handleRetry = () => {
    clearError();
    listDocuments();
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
        {onCreateNew && (
          <button className="create-button" onClick={onCreateNew}>
            Create New Document
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="document-list">
      <div className="document-list-header">
        <h2>Your Documents</h2>
        {onCreateNew && (
          <button className="create-button" onClick={onCreateNew}>
            Create New Document
          </button>
        )}
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
                  <button
                    className="action-button action-button--primary"
                    onClick={() => onDocumentSelect?.(doc.docId)}
                  >
                    Open
                  </button>
                  <button className="action-button action-button--secondary">
                    Sharing
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
