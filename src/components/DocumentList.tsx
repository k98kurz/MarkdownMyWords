import { useEffect, useState, useRef, useCallback } from 'react';
import { useDocumentStore } from '../stores/documentStore';

interface DocumentListProps {
  onDocumentSelect?: (docId: string) => void;
}

export function DocumentList({ onDocumentSelect }: DocumentListProps) {
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
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const loadDocumentMetadata = useCallback(
    async (docId: string) => {
      setLoadingMetadata(prev => new Set(prev).add(docId));

      try {
        const result = await getDocumentMetadata(docId);

        if (result.success && result.data) {
          setLoadedMetadata(prev => new Set(prev).add(docId));
        }
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

  const handleDocumentClick = (docId: string) => {
    if (!loadedMetadata.has(docId)) {
      loadDocumentMetadata(docId);
    }
    onDocumentSelect?.(docId);
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
      <p className="empty">No documents yet. Create your first document!</p>
    );
  }

  return (
    <div className="document-list">
      <h2>Your Documents</h2>
      <ul>
        {documentList.map(doc => (
          <li
            key={doc.docId}
            data-doc-id={doc.docId}
            ref={el => setItemRef(doc.docId, el)}
            onClick={() => handleDocumentClick(doc.docId)}
            className="document-item"
          >
            {loadingMetadata.has(doc.docId) ? (
              <div className="loading-meta">Loading...</div>
            ) : (
              <>
                <strong>{doc.title || 'Untitled'}</strong>
                {doc.tags && doc.tags.length > 0 && (
                  <div className="document-tags">
                    {doc.tags.map(tag => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <span className="doc-meta">
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
