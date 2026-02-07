import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { useAuthStore } from '../stores/authStore';
import { ConfirmModal } from './ConfirmModal';
import { SharingModal } from './SharingModal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { MinimalDocListItem } from '../types/document';

export function DocumentList() {
  const { user } = useAuthStore();
  const currentUserPub = user?.is?.pub;
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
    getDocumentKey,
  } = useDocumentStore();

  const [loadingMetadata, setLoadingMetadata] = useState<Set<string>>(
    new Set()
  );
  const [metadataErrors, setMetadataErrors] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | undefined>(undefined);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [sharingDoc, setSharingDoc] = useState<{
    docId: string;
    userPub: string;
    isPublic: boolean;
    docKey?: string;
  } | null>(null);
  const hasLoadedList = useRef(false);

  const loadDocumentMetadata = useCallback(
    async (docId: string) => {
      setLoadingMetadata((prev: Set<string>) => new Set(prev).add(docId));

      try {
        const result = await getDocumentMetadata(docId);

        if (result.success && result.data) {
          setLoadedMetadata(docId);
          setDocumentMetadata(docId, result.data);
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

  const loadedMetadataRef = useRef(loadedMetadata);
  const loadingMetadataRef = useRef(loadingMetadata);

  useEffect(() => {
    loadedMetadataRef.current = loadedMetadata;
  }, [loadedMetadata]);

  useEffect(() => {
    loadingMetadataRef.current = loadingMetadata;
  }, [loadingMetadata]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const docId = entry.target.getAttribute('data-doc-id');
            const currentLoadedMetadata = loadedMetadataRef.current;
            const currentLoadingMetadata = loadingMetadataRef.current;
            if (
              docId &&
              !currentLoadedMetadata.has(docId) &&
              !currentLoadingMetadata.has(docId)
            ) {
              loadDocumentMetadata(docId);
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    itemRefs.current.forEach((element, _docId) => {
      observerRef.current?.observe(element);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadDocumentMetadata]);

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

  const handleShareClick = async (docId: string) => {
    const doc = documentList.find(d => d.docId === docId) as
      | MinimalDocListItem
      | undefined;
    if (!doc) return;

    const sharingData = {
      docId: doc.docId,
      userPub: currentUserPub!,
      isPublic: doc.isPublic,
    };

    if (!doc.isPublic) {
      const keyResult = await getDocumentKey(docId);
      if (keyResult.success && keyResult.data) {
        setSharingDoc({ ...sharingData, docKey: keyResult.data });
        setShowSharingModal(true);
      }
    } else {
      setSharingDoc(sharingData);
      setShowSharingModal(true);
    }
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
          className="mt-6 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover hover:text-primary-hover-text bg-primary"
        >
          Create New Document
        </Link>
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-card-foreground">
            Your Documents
          </h2>
          <Link
            to="/doc/new"
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover hover:text-primary-hover-text bg-primary"
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
              className="flex items-center justify-between gap-4 rounded-md border border-foreground-10 bg-foreground-3 px-4 py-4 transition-all hover:bg-foreground-6 hover:border-foreground-20"
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
                          <div className="mx-2 flex flex-wrap gap-2">
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
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDelete(doc.docId)}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleShareClick(doc.docId)}
                    >
                      Sharing
                    </Button>
                    <Link
                      to={`/doc/${currentUserPub}/${doc.docId}`}
                      className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover hover:text-primary-hover-text bg-primary"
                    >
                      Open
                    </Link>
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

      <SharingModal
        isOpen={showSharingModal && sharingDoc !== null}
        onClose={() => {
          setShowSharingModal(false);
          setSharingDoc(null);
        }}
        docId={sharingDoc?.docId || ''}
        userPub={sharingDoc?.userPub || ''}
        isPublic={sharingDoc?.isPublic || false}
        docKey={sharingDoc?.docKey}
      />
    </>
  );
}
