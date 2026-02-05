import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { ConfirmModal } from './ConfirmModal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

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
    return (
      <div className="px-8 py-8 text-center text-lg">Loading documents...</div>
    );
  }

  if (error && documentList.length === 0) {
    return (
      <div className="px-8 py-8 text-center">
        <p className="mb-4">{error}</p>
        <Button onClick={handleRetry}>Retry</Button>
      </div>
    );
  }

  if (documentList.length === 0) {
    return (
      <div className="px-8 py-16 text-center text-muted-foreground">
        <p className="mb-0 text-lg">
          No documents yet. Create your first document!
        </p>
        <Link
          to="/doc/new"
          className="mt-6 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#535bf2]"
          style={{ backgroundColor: '#646cff' }}
        >
          Create New Document
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-card-foreground">
          Your Documents
        </h2>
        <Link
          to="/doc/new"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#535bf2]"
          style={{ backgroundColor: '#646cff' }}
        >
          Create New Document
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {documentList.map(doc => (
          <li
            key={doc.docId}
            data-doc-id={doc.docId}
            ref={el => setItemRef(doc.docId, el)}
            className="flex items-center justify-between gap-4 rounded-md border border-border bg-accent/3 px-4 py-4 transition-all hover:bg-accent/6 hover:border-border/20"
          >
            {loadingMetadata.has(doc.docId) ? (
              <div className="flex min-w-0 flex-1">
                <div className="text-muted-foreground/50 italic text-sm">
                  Loading...
                </div>
              </div>
            ) : metadataErrors.has(doc.docId) ? (
              <div className="flex min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <strong className="text-rose-500 text-sm">
                    Error loading doc metadata
                  </strong>
                  <span className="text-muted-foreground/50 text-sm">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <strong className="text-base font-semibold text-card-foreground">
                      {enrichedDocs.get(doc.docId)?.title || 'Untitled'}
                    </strong>
                    <span className="text-muted-foreground/50 text-sm">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {(() => {
                    const tags = enrichedDocs.get(doc.docId)?.tags;
                    if (tags && tags.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-2">
                          {tags.map(tag => (
                            <Badge key={tag}>{tag}</Badge>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex gap-2 ml-4">
                  <Link
                    to={`/doc/${doc.docId}`}
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#535bf2]"
                    style={{ backgroundColor: '#646cff' }}
                  >
                    Open
                  </Link>
                  <Button size="sm" variant="secondary">
                    Sharing
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleDelete(doc.docId)}
                  >
                    Delete
                  </Button>
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
