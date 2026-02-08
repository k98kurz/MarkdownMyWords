/**
 * Document Store
 *
 * Zustand store for document state management using GunDB and SEA encryption.
 * Handles document CRUD, branching, and sharing operations with type-safe error handling.
 */

import { create } from 'zustand';
import { type Result, tryCatch, match } from '@/lib/functionalResult';
import type {
  Document,
  DocumentAccessEntry,
  DocumentError,
  MinimalDocListItem,
  SharedDocNotification,
} from '@/types/document';
import { gunService } from '@/services/gunService';
import { GunNodeRef, GunAck } from '@/types/gun';
import { encryptionService } from '@/services/encryptionService';
import { useAuthStore } from '@/stores/authStore';

const transformError = (error: unknown): DocumentError => {
  if (error instanceof Error) {
    console.error(error);
    const msg = error.message;
    if (
      msg.includes('Title is required') ||
      msg.includes('Content is required') ||
      msg.includes('Title cannot be empty') ||
      msg.includes('cannot be empty') ||
      msg.includes('No updates provided') ||
      msg.includes('required') ||
      msg.includes('validation')
    ) {
      return {
        code: 'VALIDATION_ERROR',
        message: msg,
        details: error,
      };
    }
    if (
      msg.includes('encryption') ||
      msg.includes('decryption') ||
      msg.includes('ECDH') ||
      msg.includes('could not be decrypted')
    ) {
      return {
        code: 'ENCRYPTION_ERROR',
        message: 'Failed to process document',
        details: error,
      };
    }
    if (msg.includes('must be logged in')) {
      return {
        code: 'AUTH_REQUIRED',
        message: 'Please log in to view this document',
        details: error,
      };
    }
    if (
      msg.includes('docKey') ||
      msg.includes('permission') ||
      msg.includes('User not authenticated') ||
      msg.includes('access')
    ) {
      // Preserve original error message instead of hardcoding
      return {
        code: 'PERMISSION_DENIED',
        message: msg,
        details: error,
      };
    }
    if (
      msg.includes('not found') ||
      msg.includes('Parent document not found') ||
      msg.includes('Not a branch')
    ) {
      // But NOT "access" errors - those are permission denied
      if (!msg.includes('access')) {
        return {
          code: 'NOT_FOUND',
          message: 'Document not found',
          details: error,
        };
      }
    }
    return {
      code: 'NETWORK_ERROR',
      message: msg,
      details: error,
    };
  }
  return {
    code: 'NETWORK_ERROR',
    message: 'An unexpected error occurred',
    details: error,
  };
};

function arrayToCSV(tags?: string[] | unknown): string {
  if (Array.isArray(tags)) {
    return (tags as string[]).join(',');
  }
  if (typeof tags === 'string') {
    return tags;
  }
  return '';
}

function csvToArray(tags?: string | unknown): string[] {
  if (Array.isArray(tags)) {
    return (tags as string[]).filter(t => t.length > 0);
  }
  if (typeof tags === 'string' && tags.trim()) {
    return tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
  return [];
}

function validateTagsNoCommas(tags: string[] | undefined): void {
  if (tags && tags.length > 0) {
    for (const tag of tags) {
      if (tag.includes(',')) {
        throw new Error('Tags cannot contain commas');
      }
    }
  }
}

/**
 * Document State Interface
 */
interface DocumentState {
  currentDocument: Document | null;
  documentList: Array<{
    docId: string;
    soul: string;
    createdAt: number;
    updatedAt: number;
    title?: string;
    tags?: string[];
  }>;
  loadedMetadata: Set<string>;
  enrichedDocs: Map<
    string,
    { title?: string; tags?: string[]; isPublic?: boolean }
  >;
  status: 'READY' | 'LOADING' | 'SAVING';
  error: string | null;
  loadingDocId?: string;
}

/**
 * Document Actions Interface
 */
interface DocumentActions {
  // Status helpers
  setLoading: () => void;
  setSaving: () => void;
  setReady: () => void;

  // Loading state helpers
  setLoadingDocId: (docId: string | undefined) => void;

  // Error helpers
  setError: (error: string) => void;
  clearError: () => void;

  // Current document helpers
  clearCurrentDocument: () => void;

  // Metadata helpers
  setLoadedMetadata: (docId: string) => void;
  setDocumentMetadata: (
    docId: string,
    metadata: { title?: string; tags?: string[]; isPublic?: boolean }
  ) => void;
  clearDocumentMetadata: (docId: string) => void;
  clearMetadata: () => void;

  // Document CRUD operations
  createDocument: (
    title: string,
    content: string,
    tags?: string[],
    isPublic?: boolean
  ) => Promise<Result<Document, DocumentError>>;
  getDocument: (
    docId: string,
    userPub: string,
    providedKey?: string
  ) => Promise<Result<Document | null, DocumentError>>;
  updateDocument: (
    docId: string,
    updates: Partial<Pick<Document, 'title' | 'content' | 'tags'>>
  ) => Promise<Result<void, DocumentError>>;
  deleteDocument: (docId: string) => Promise<Result<void, DocumentError>>;
  listDocuments: () => Promise<Result<MinimalDocListItem[], DocumentError>>;
  getDocumentMetadata: (
    docId: string
  ) => Promise<
    Result<Pick<Document, 'title' | 'tags' | 'isPublic'>, DocumentError>
  >;

  // Sharing operations
  shareDocument: (
    docId: string,
    userId: string
  ) => Promise<Result<void, DocumentError>>;
  unshareDocument: (
    docId: string,
    userId: string
  ) => Promise<Result<void, DocumentError>>;
  getDocumentKey: (docId: string) => Promise<Result<string, DocumentError>>;

  // Privacy operations
  setDocumentPrivate: (
    docId: string,
    key?: string
  ) => Promise<Result<void, DocumentError>>;
  setDocumentPublic: (docId: string) => Promise<Result<void, DocumentError>>;
  changeDocumentKey: (
    docId: string,
    password?: string
  ) => Promise<Result<void, DocumentError>>;
}

/**
 * Document Store
 *
 * Manages document state using GunDB and SEA encryption.
 * Handles document CRUD, branching, and sharing operations.
 */
export const useDocumentStore = create<DocumentState & DocumentActions>(
  (set, get) => ({
    currentDocument: null,
    documentList: [],
    loadedMetadata: new Set(),
    enrichedDocs: new Map(),
    status: 'READY',
    error: null,

    // Status helpers
    setLoading: () => set({ status: 'LOADING', error: null }),
    setSaving: () => set({ status: 'SAVING', error: null }),
    setReady: () => set({ status: 'READY' }),

    // Loading state helpers
    setLoadingDocId: (docId: string | undefined) =>
      set({ loadingDocId: docId }),

    // Error helpers
    setError: (error: string) => set({ status: 'READY', error }),
    clearError: () => set({ error: null }),

    // Current document helpers
    clearCurrentDocument: () => {
      set({
        currentDocument: null,
        status: 'READY',
        error: null,
        loadingDocId: undefined,
      });
    },

    // Metadata helpers
    setLoadedMetadata: (docId: string) => {
      set((state: DocumentState) => ({
        loadedMetadata: new Set(state.loadedMetadata).add(docId),
      }));
    },

    setDocumentMetadata: (
      docId: string,
      metadata: { title?: string; tags?: string[]; isPublic?: boolean }
    ) => {
      set((state: DocumentState) => ({
        enrichedDocs: new Map(state.enrichedDocs).set(docId, metadata),
      }));
    },

    clearDocumentMetadata: (docId: string) => {
      set((state: DocumentState) => {
        const newLoadedMetadata = new Set(state.loadedMetadata);
        newLoadedMetadata.delete(docId);
        const newEnrichedDocs = new Map(state.enrichedDocs);
        newEnrichedDocs.delete(docId);
        return {
          loadedMetadata: newLoadedMetadata,
          enrichedDocs: newEnrichedDocs,
        };
      });
    },

    clearMetadata: () => {
      set({
        loadedMetadata: new Set(),
        enrichedDocs: new Map(),
      });
    },

    createDocument: async (
      title: string,
      content: string,
      tags?: string[],
      isPublic: boolean = false
    ): Promise<Result<Document, DocumentError>> => {
      set({ status: 'SAVING', error: null });

      const result = (await tryCatch(async () => {
        console.log('documentStore.createDocument called...');
        console.log({ title, content, tags, isPublic });
        if (!title?.trim()) {
          throw new Error('Title is required');
        }
        if (!content?.trim()) {
          throw new Error('Content is required');
        }

        validateTagsNoCommas(tags);

        const docId = gunService.newId();
        const gun = gunService.getGun();
        const userNode = gun.user();

        let docKey: string | undefined;
        let encryptedTitle = title.trim();
        let encryptedContent = content;
        let tagsCSV = arrayToCSV(tags);

        if (!isPublic) {
          const keyResult = await encryptionService.generateKey();
          if (!keyResult.success) {
            throw keyResult.error;
          }
          docKey = keyResult.data;

          const titleResult = await encryptionService.encrypt(
            title.trim(),
            docKey
          );
          if (!titleResult.success) {
            throw titleResult.error;
          }
          encryptedTitle = titleResult.data;

          const contentResult = await encryptionService.encrypt(
            content,
            docKey
          );
          if (!contentResult.success) {
            throw contentResult.error;
          }
          encryptedContent = contentResult.data;

          if (tags && tags.length > 0 && tagsCSV) {
            const tagsResult = await encryptionService.encrypt(
              tagsCSV,
              docKey!
            );
            if (!tagsResult.success) {
              throw tagsResult.error;
            }
            tagsCSV = tagsResult.data;
          }

          const writeResult = await gunService.writePrivateData(
            ['docKeys', docId],
            docKey
          );
          if (!writeResult.success) {
            throw writeResult.error;
          }
        }

        const docNode = userNode.get('docs').get(docId);
        const document: Partial<Document> = {
          id: docId,
          title: title,
          content: content,
          tags: tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPublic: isPublic,
        };

        const documentForStorage = {
          ...document,
          title: encryptedTitle,
          content: encryptedContent,
          tags: tagsCSV,
        };

        await new Promise<void>((resolve, reject) => {
          docNode.put(documentForStorage, (ack: GunAck) => {
            if (ack.err) {
              reject(new Error(`Failed to save document: ${String(ack.err)}`));
            } else {
              resolve();
            }
          });
        });

        document.access = [];

        return document;
      }, transformError)) as Result<Document, DocumentError>;
      match(
        (doc: Document) => {
          set({
            currentDocument: doc,
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    getDocument: async (
      docId: string,
      userPub: string,
      providedKey?: string
    ): Promise<Result<Document | null, DocumentError>> => {
      set({ status: 'LOADING', error: null, loadingDocId: docId });

      const result = (await tryCatch(async () => {
        const gun = gunService.getGun();

        const docNode = gun.get(`~${userPub}`).get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        let docKey: string | undefined;

        // PUBLIC DOCUMENT: No encryption
        if (doc.isPublic) {
          // No key needed - content is unencrypted
        }
        // PRIVATE DOCUMENT
        else {
          // Try provided key first (Phase 2: password/key access)
          if (providedKey) {
            docKey = providedKey;
          }
          // Otherwise, require authentication and read from private storage
          else {
            const { user: currentUser } = useAuthStore.getState();

            if (!currentUser || !currentUser.is?.pub) {
              throw new Error('must be logged in to view this document');
            }

            const readKeyResult = await gunService.readPrivateData([
              'docKeys',
              docId,
            ]);
            if (!readKeyResult.success) {
              throw new Error('You do not have access to this document');
            }
            docKey = readKeyResult.data;

            if (!docKey) {
              throw new Error('You do not have access to this document');
            }
          }
        }

        let decryptedTitle = doc.title ?? '';
        let decryptedContent = doc.content ?? '';
        let tagsCSV = doc.tags;
        let tags: string[] = [];

        if (docKey && !doc.isPublic) {
          try {
            const titleResult = await encryptionService.decrypt(
              doc.title ?? '',
              docKey
            );
            if (!titleResult.success) {
              throw titleResult.error;
            }
            decryptedTitle = titleResult.data;

            const contentResult = await encryptionService.decrypt(
              doc.content ?? '',
              docKey
            );
            if (!contentResult.success) {
              throw contentResult.error;
            }
            decryptedContent = contentResult.data;

            if (tagsCSV && typeof tagsCSV === 'string') {
              const tagsResult = await encryptionService.decrypt(
                tagsCSV,
                docKey
              );
              if (!tagsResult.success) {
                throw tagsResult.error;
              }
              tags = csvToArray(tagsResult.data) ?? [];
            }
          } catch (error) {
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              'message' in error
            ) {
              throw error;
            }
            throw new Error('could not be decrypted');
          }
        } else if (tagsCSV && typeof tagsCSV === 'string') {
          tags = csvToArray(tagsCSV) ?? [];
        }

        const document: Document = {
          id: doc.id,
          title: decryptedTitle,
          content: decryptedContent,
          tags,
          createdAt: doc.createdAt ?? Date.now(),
          updatedAt: doc.updatedAt ?? Date.now(),
          isPublic: doc.isPublic ?? false,
          access: doc.access ?? [],
          parent: doc.parent,
          original: doc.original,
        };

        return document;
      }, transformError)) as Result<Document | null, DocumentError>;

      match(
        (doc: Document | null) => {
          set({
            currentDocument: doc,
            status: 'READY',
            error: null,
            loadingDocId: undefined,
          });
        },
        (error: DocumentError) => {
          if (error.code === 'NOT_FOUND') {
            set({
              currentDocument: null,
              status: 'READY',
              error: null,
              loadingDocId: undefined,
            });
          } else {
            set({
              currentDocument: null,
              status: 'READY',
              error: error.message,
              loadingDocId: undefined,
            });
          }
        }
      )(result);

      if (!result.success && result.error.code === 'NOT_FOUND') {
        return { success: true, data: null };
      }

      return result;
    },

    updateDocument: async (
      docId: string,
      updates: Partial<Pick<Document, 'title' | 'content' | 'tags'>>
    ): Promise<Result<void, DocumentError>> => {
      set({ status: 'SAVING', error: null });

      const result = (await tryCatch(async () => {
        if (!updates || Object.keys(updates).length === 0) {
          throw new Error('No updates provided');
        }

        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        let docKey: string | undefined;
        if (!doc.isPublic) {
          const readKeyResult = await gunService.readPrivateData([
            'docKeys',
            docId,
          ]);
          if (!readKeyResult.success) {
            throw new Error('Document key not found');
          }
          docKey = readKeyResult.data;
        }

        const currentDoc = get();
        const isCurrentDoc = currentDoc.currentDocument?.id === docId;

        const updatesToApply = updates;

        let finalTitle = updatesToApply.title ?? doc.title;
        let finalContent = updatesToApply.content ?? doc.content;
        let finalTags = updatesToApply.tags
          ? arrayToCSV(updatesToApply.tags)
          : typeof doc.tags === 'string'
            ? doc.tags
            : arrayToCSV(doc.tags ?? []);

        if (finalTitle !== undefined && !finalTitle?.trim()) {
          throw new Error('Title cannot be empty');
        }

        if (docKey && !doc.isPublic) {
          if (finalTitle !== undefined) {
            const titleResult = await encryptionService.encrypt(
              finalTitle,
              docKey
            );
            if (!titleResult.success) {
              throw titleResult.error;
            }
            finalTitle = titleResult.data;
          }
          if (finalContent !== undefined) {
            const contentResult = await encryptionService.encrypt(
              finalContent,
              docKey
            );
            if (!contentResult.success) {
              throw contentResult.error;
            }
            finalContent = contentResult.data;
          }
          if (finalTags !== undefined) {
            const tagsResult = await encryptionService.encrypt(
              finalTags,
              docKey
            );
            if (!tagsResult.success) {
              throw tagsResult.error;
            }
            finalTags = tagsResult.data;
          }
        }

        type UpdatedDoc = {
          id: string;
          title: string;
          content: string;
          tags: string;
          createdAt: number;
          updatedAt: number;
          isPublic: boolean;
          access?: DocumentAccessEntry[];
          parent?: string;
          original?: string;
        };

        let updatedDoc: UpdatedDoc = {
          id: doc.id!,
          title: finalTitle!,
          content: finalContent!,
          tags: finalTags!,
          createdAt: doc.createdAt!,
          updatedAt: Date.now(),
          isPublic: doc.isPublic!,
        };

        if (doc.access !== undefined) {
          updatedDoc = { ...updatedDoc, access: doc.access };
        }
        if (doc.parent !== undefined) {
          updatedDoc = { ...updatedDoc, parent: doc.parent };
        }
        if (doc.original !== undefined) {
          updatedDoc = { ...updatedDoc, original: doc.original };
        }

        await new Promise<void>((resolve, reject) => {
          docNode.put(updatedDoc, (ack: GunAck) => {
            if (ack.err) {
              reject(
                new Error(`Failed to update document: ${String(ack.err)}`)
              );
            } else {
              resolve();
            }
          });
        });

        if (isCurrentDoc) {
          let decryptedTitle = updatedDoc.title ?? '';
          let decryptedContent = updatedDoc.content ?? '';
          let decryptedTags: string[] = [];

          if (docKey && !doc.isPublic) {
            const titleResult = await encryptionService.decrypt(
              updatedDoc.title ?? '',
              docKey
            );
            if (!titleResult.success) {
              throw titleResult.error;
            }
            decryptedTitle = titleResult.data;

            const contentResult = await encryptionService.decrypt(
              updatedDoc.content ?? '',
              docKey
            );
            if (!contentResult.success) {
              throw contentResult.error;
            }
            decryptedContent = contentResult.data;

            if (updatedDoc.tags && typeof updatedDoc.tags === 'string') {
              const tagsResult = await encryptionService.decrypt(
                updatedDoc.tags,
                docKey
              );
              if (!tagsResult.success) {
                throw tagsResult.error;
              }
              decryptedTags = csvToArray(tagsResult.data) ?? [];
            }
          } else if (updatedDoc.tags && typeof updatedDoc.tags === 'string') {
            decryptedTags = csvToArray(updatedDoc.tags) ?? [];
          }

          const decryptedDoc: Document = {
            id: doc.id!,
            title: decryptedTitle,
            content: decryptedContent,
            tags: decryptedTags,
            createdAt: doc.createdAt ?? Date.now(),
            updatedAt: updatedDoc.updatedAt ?? Date.now(),
            isPublic: doc.isPublic ?? false,
            access: doc.access ?? [],
            parent: doc.parent,
            original: doc.original,
          };

          set({
            currentDocument: decryptedDoc,
          });
        }

        return undefined;
      }, transformError)) as Result<void, DocumentError>;

      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    deleteDocument: async (
      docId: string
    ): Promise<Result<void, DocumentError>> => {
      set({ status: 'LOADING', error: null });

      const result = (await tryCatch(async () => {
        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;

        await new Promise<void>((resolve, reject) => {
          docNode.put(null, (ack: GunAck) => {
            if (ack.err) {
              reject(
                new Error(`Failed to delete document: ${String(ack.err)}`)
              );
            } else {
              resolve();
            }
          });
        });

        if (!doc.isPublic) {
          const privatePathResult = await gunService.getPrivatePath([
            'docKeys',
            docId,
          ]);
          if (!privatePathResult.success) {
            throw privatePathResult.error;
          }
          const node = privatePathResult.data.reduce(
            (n: unknown, part: string) => (n as GunNodeRef).get(part),
            userNode
          ) as GunNodeRef;

          await new Promise<void>((resolve, reject) => {
            node.put(null, (ack: GunAck) => {
              if (ack.err) {
                reject(
                  new Error(`Failed to delete document key: ${String(ack.err)}`)
                );
              } else {
                resolve();
              }
            });
          });
        }

        return undefined;
      }, transformError)) as Result<void, DocumentError>;

      match(
        () => {
          const currentDocId = get().currentDocument?.id;
          if (currentDocId === docId) {
            set({
              currentDocument: null,
            });
          }

          const documentList = get().documentList;
          const updatedList = documentList.filter(item => item.docId !== docId);

          set({
            documentList: updatedList,
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    listDocuments: async (): Promise<
      Result<MinimalDocListItem[], DocumentError>
    > => {
      set({ status: 'LOADING', error: null });

      const result = (await tryCatch(async () => {
        const itemsResult = await gunService.listUserItems(['docs']);
        if (!itemsResult.success) {
          throw itemsResult.error;
        }
        const items = itemsResult.data;

        const minimalDocs: MinimalDocListItem[] = items
          .map(item => {
            const data = item.data as Partial<Document> | undefined;
            if (!data || !data.id) {
              return null;
            }

            return {
              docId: data.id,
              soul: item.soul,
              createdAt: data.createdAt ?? Date.now(),
              updatedAt: data.updatedAt ?? Date.now(),
              isPublic: data.isPublic ?? false,
            };
          })
          .filter((item): item is MinimalDocListItem => item !== null);

        return minimalDocs;
      }, transformError)) as Result<MinimalDocListItem[], DocumentError>;

      match(
        (docs: MinimalDocListItem[]) => {
          set({
            documentList: docs,
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    getDocumentMetadata: async (
      docId: string
    ): Promise<
      Result<Pick<Document, 'title' | 'tags' | 'isPublic'>, DocumentError>
    > => {
      set({ status: 'LOADING', error: null });

      const result = (await tryCatch(async () => {
        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        let docKey: string | undefined;
        if (!doc.isPublic) {
          const readKeyResult = await gunService.readPrivateData([
            'docKeys',
            docId,
          ]);
          if (!readKeyResult.success) {
            throw new Error('Document key not found');
          }
          docKey = readKeyResult.data;
        }

        let decryptedTitle = doc.title ?? '';
        let tagsCSV = doc.tags;
        let tags: string[] = [];

        if (docKey && !doc.isPublic) {
          const titleResult = await encryptionService.decrypt(
            doc.title ?? '',
            docKey
          );
          if (!titleResult.success) {
            throw titleResult.error;
          }
          decryptedTitle = titleResult.data;

          if (tagsCSV && typeof tagsCSV === 'string') {
            const tagsResult = await encryptionService.decrypt(tagsCSV, docKey);
            if (!tagsResult.success) {
              throw tagsResult.error;
            }
            tags = csvToArray(tagsResult.data) ?? [];
          }
        } else if (tagsCSV && typeof tagsCSV === 'string') {
          tags = csvToArray(tagsCSV) ?? [];
        }

        const metadata: Pick<Document, 'title' | 'tags' | 'isPublic'> = {
          title: decryptedTitle,
          tags: tags,
          isPublic: doc.isPublic ?? false,
        };

        return metadata;
      }, transformError)) as Result<
        Pick<Document, 'title' | 'tags' | 'isPublic'>,
        DocumentError
      >;

      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    shareDocument: async (
      docId: string,
      userId: string
    ): Promise<Result<void, DocumentError>> => {
      set({ status: 'SAVING', error: null });

      const result = (await tryCatch(async () => {
        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        const currentAccess = doc.access ?? [];
        const existingAccess = currentAccess.find(a => a.userId === userId);
        if (existingAccess) {
          return undefined;
        }

        const currentUser = userNode.is;
        if (!currentUser || !currentUser.epub) {
          throw new Error('User not authenticated');
        }

        const discoveredUsersResult = await gunService.discoverUsers(userId);
        if (!discoveredUsersResult.success) {
          throw new Error('User not found');
        }

        const discoveredUsers = discoveredUsersResult.data;
        if (!discoveredUsers || discoveredUsers.length === 0) {
          throw new Error('User not found');
        }

        const discoveredUser = discoveredUsers[0];
        const userData = discoveredUser.data as { epub?: string } | undefined;
        const recipientEpub = userData?.epub;

        if (!recipientEpub) {
          throw new Error('User not found');
        }

        let encryptedDocKey = '';

        if (!doc.isPublic) {
          const docKeyResult = await gunService.readPrivateData([
            'docKeys',
            docId,
          ]);
          if (!docKeyResult.success) {
            throw new Error('Document key not found');
          }
          const docKey = docKeyResult.data;
          const encryptResult = await encryptionService.encryptECDH(
            docKey,
            recipientEpub
          );
          if (!encryptResult.success) {
            throw encryptResult.error;
          }
          encryptedDocKey = encryptResult.data;
        }

        const newAccessEntry = {
          userId,
          docKey: encryptedDocKey,
          senderEpub: currentUser.epub,
        };

        const updatedAccess = [...currentAccess, newAccessEntry];

        const notification: SharedDocNotification = {
          senderAlias: currentUser.alias,
          senderPub: currentUser.pub as string,
          senderEpub: currentUser.epub as string,
          docId,
          sharedAt: Date.now(),
          isPublic: !!doc.isPublic,
          encryptedDocKey: !doc.isPublic ? encryptedDocKey : undefined,
        } as SharedDocNotification;

        await gunService.writePrivateData(
          ['sharedDocs', userId, docId],
          JSON.stringify(notification)
        );

        await new Promise<void>((resolve, reject) => {
          docNode.put({ access: updatedAccess }, (ack: GunAck) => {
            if (ack.err) {
              reject(new Error(`Failed to share document: ${String(ack.err)}`));
            } else {
              resolve();
            }
          });
        });

        return undefined;
      }, transformError)) as Result<void, DocumentError>;
      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    unshareDocument: async (
      docId: string,
      userId: string
    ): Promise<Result<void, DocumentError>> => {
      set({ status: 'SAVING', error: null });

      const result = (await tryCatch(async () => {
        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        const currentAccess = doc.access ?? [];
        const updatedAccess = currentAccess.filter(a => a.userId !== userId);

        await new Promise<void>((resolve, reject) => {
          docNode.put({ access: updatedAccess }, (ack: GunAck) => {
            if (ack.err) {
              reject(
                new Error(`Failed to unshare document: ${String(ack.err)}`)
              );
            } else {
              resolve();
            }
          });
        });

        return undefined;
      }, transformError)) as Result<void, DocumentError>;
      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    getDocumentKey: async (
      docId: string
    ): Promise<Result<string, DocumentError>> => {
      const result = (await tryCatch(async () => {
        const { user: currentUser } = useAuthStore.getState();

        if (!currentUser || !currentUser.is?.pub) {
          throw new Error('must be logged in to share document');
        }

        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        if (doc.isPublic) {
          throw new Error('Public documents do not have a key');
        }

        const docKeyResult = await gunService.readPrivateData([
          'docKeys',
          docId,
        ]);

        if (!docKeyResult.success) {
          throw docKeyResult.error;
        }

        return docKeyResult.data;
      }, transformError)) as Result<string, DocumentError>;

      return result;
    },

    setDocumentPrivate: async (
      docId: string,
      key?: string
    ): Promise<Result<void, DocumentError>> => {
      const result = (await tryCatch(async () => {
        const { user: currentUser } = useAuthStore.getState();

        if (!currentUser || !currentUser.is?.pub) {
          throw new Error('must be logged in to change document privacy');
        }

        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        if (doc.isPublic) {
          const title = doc.title ?? '';
          const content = doc.content ?? '';
          const tagsCSV = arrayToCSV(doc.tags);

          let docKey: string;
          if (key !== undefined) {
            docKey = key;
          } else {
            const keyResult = await encryptionService.generateKey();
            if (!keyResult.success) {
              throw keyResult.error;
            }
            docKey = keyResult.data;
          }

          const titleResult = await encryptionService.encrypt(title, docKey);
          if (!titleResult.success) {
            throw titleResult.error;
          }
          const encryptedTitle = titleResult.data;

          const contentResult = await encryptionService.encrypt(
            content,
            docKey
          );
          if (!contentResult.success) {
            throw contentResult.error;
          }
          const encryptedContent = contentResult.data;

          let encryptedTags = tagsCSV;
          if (tagsCSV) {
            const tagsResult = await encryptionService.encrypt(tagsCSV, docKey);
            if (!tagsResult.success) {
              throw tagsResult.error;
            }
            encryptedTags = tagsResult.data;
          }

          const writeKeyResult = await gunService.writePrivateData(
            ['docKeys', docId],
            docKey
          );
          if (!writeKeyResult.success) {
            throw writeKeyResult.error;
          }

          type UpdatedDoc = {
            id: string;
            title: string;
            content: string;
            tags: string;
            createdAt: number;
            updatedAt: number;
            isPublic: boolean;
            access?: DocumentAccessEntry[];
            parent?: string;
            original?: string;
          };

          const updatedDoc: UpdatedDoc = {
            id: doc.id,
            title: encryptedTitle,
            content: encryptedContent,
            tags: encryptedTags,
            createdAt: doc.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            isPublic: false,
          };

          if (doc.access !== undefined) {
            Object.assign(updatedDoc, { access: doc.access });
          }
          if (doc.parent !== undefined) {
            Object.assign(updatedDoc, { parent: doc.parent });
          }
          if (doc.original !== undefined) {
            Object.assign(updatedDoc, { original: doc.original });
          }

          await new Promise<void>((resolve, reject) => {
            docNode.put(updatedDoc, (ack: GunAck) => {
              if (ack.err) {
                reject(
                  new Error(`Failed to update document: ${String(ack.err)}`)
                );
              } else {
                resolve();
              }
            });
          });
        } else {
          throw new Error('Document is already private');
        }

        return undefined;
      }, transformError)) as Result<void, DocumentError>;

      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    setDocumentPublic: async (
      docId: string
    ): Promise<Result<void, DocumentError>> => {
      const result = (await tryCatch(async () => {
        const { user: currentUser } = useAuthStore.getState();

        if (!currentUser || !currentUser.is?.pub) {
          throw new Error('must be logged in to change document privacy');
        }

        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        if (!doc.isPublic) {
          const keyResult = await gunService.readPrivateData([
            'docKeys',
            docId,
          ]);
          if (!keyResult.success) {
            throw keyResult.error;
          }
          const docKey = keyResult.data;

          const titleResult = await encryptionService.decrypt(
            doc.title ?? '',
            docKey
          );
          if (!titleResult.success) {
            throw titleResult.error;
          }
          const decryptedTitle = titleResult.data;

          const contentResult = await encryptionService.decrypt(
            doc.content ?? '',
            docKey
          );
          if (!contentResult.success) {
            throw contentResult.error;
          }
          const decryptedContent = contentResult.data;

          let decryptedTags: string = '';
          if (doc.tags && typeof doc.tags === 'string') {
            const tagsResult = await encryptionService.decrypt(
              doc.tags,
              docKey
            );
            if (!tagsResult.success) {
              throw tagsResult.error;
            }
            decryptedTags = tagsResult.data;
          }

          const deleteKeyResult = await gunService.deletePrivateData([
            'docKeys',
            docId,
          ]);
          if (!deleteKeyResult.success) {
            throw deleteKeyResult.error;
          }

          type UpdatedDoc = {
            id: string;
            title: string;
            content: string;
            tags: string;
            createdAt: number;
            updatedAt: number;
            isPublic: boolean;
            access?: DocumentAccessEntry[];
            parent?: string;
            original?: string;
          };

          const updatedDoc: UpdatedDoc = {
            id: doc.id,
            title: decryptedTitle,
            content: decryptedContent,
            tags: decryptedTags,
            createdAt: doc.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            isPublic: true,
          };

          if (doc.access !== undefined) {
            Object.assign(updatedDoc, { access: doc.access });
          }
          if (doc.parent !== undefined) {
            Object.assign(updatedDoc, { parent: doc.parent });
          }
          if (doc.original !== undefined) {
            Object.assign(updatedDoc, { original: doc.original });
          }

          await new Promise<void>((resolve, reject) => {
            docNode.put(updatedDoc, (ack: GunAck) => {
              if (ack.err) {
                reject(
                  new Error(`Failed to update document: ${String(ack.err)}`)
                );
              } else {
                resolve();
              }
            });
          });
        } else {
          throw new Error('Document is already public');
        }

        return undefined;
      }, transformError)) as Result<void, DocumentError>;

      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },

    changeDocumentKey: async (
      docId: string,
      password?: string
    ): Promise<Result<void, DocumentError>> => {
      const result = (await tryCatch(async () => {
        if (password !== undefined && password.length < 8) {
          throw new Error('Password must be at least 8 characters');
        }

        const { user: currentUser } = useAuthStore.getState();

        if (!currentUser || !currentUser.is?.pub) {
          throw new Error('must be logged in to change document key');
        }

        const gun = gunService.getGun();
        const userNode = gun.user();
        const docNode = userNode.get('docs').get(docId);

        const docData = await new Promise<unknown>((resolve, reject) => {
          docNode.once((data: unknown) => {
            if (data === null || data === undefined) {
              reject(new Error('Document not found'));
            } else {
              resolve(data);
            }
          });
        });

        if (!docData || typeof docData !== 'object') {
          throw new Error('Document not found');
        }

        const doc = docData as Partial<Document>;
        if (!doc.id) {
          throw new Error('Document not found');
        }

        if (doc.isPublic) {
          throw new Error('Cannot change key for public documents');
        }

        const oldKeyResult = await gunService.readPrivateData([
          'docKeys',
          docId,
        ]);
        if (!oldKeyResult.success) {
          throw oldKeyResult.error;
        }
        const oldKey = oldKeyResult.data;

        const titleResult = await encryptionService.decrypt(
          doc.title ?? '',
          oldKey
        );
        if (!titleResult.success) {
          throw titleResult.error;
        }
        const decryptedTitle = titleResult.data;

        const contentResult = await encryptionService.decrypt(
          doc.content ?? '',
          oldKey
        );
        if (!contentResult.success) {
          throw contentResult.error;
        }
        const decryptedContent = contentResult.data;

        let decryptedTags: string = '';
        if (doc.tags && typeof doc.tags === 'string') {
          const tagsResult = await encryptionService.decrypt(doc.tags, oldKey);
          if (!tagsResult.success) {
            throw tagsResult.error;
          }
          decryptedTags = tagsResult.data;
        }

        const newKey = password
          ? password
          : await (async () => {
              const keyResult = await encryptionService.generateKey();
              if (!keyResult.success) {
                throw keyResult.error;
              }
              return keyResult.data;
            })();

        const encryptTitleResult = await encryptionService.encrypt(
          decryptedTitle,
          newKey
        );
        if (!encryptTitleResult.success) {
          throw encryptTitleResult.error;
        }
        const encryptedTitle = encryptTitleResult.data;

        const encryptContentResult = await encryptionService.encrypt(
          decryptedContent,
          newKey
        );
        if (!encryptContentResult.success) {
          throw encryptContentResult.error;
        }
        const encryptedContent = encryptContentResult.data;

        let encryptedTags = decryptedTags;
        if (decryptedTags) {
          const encryptTagsResult = await encryptionService.encrypt(
            decryptedTags,
            newKey
          );
          if (!encryptTagsResult.success) {
            throw encryptTagsResult.error;
          }
          encryptedTags = encryptTagsResult.data;
        }

        const writeKeyResult = await gunService.writePrivateData(
          ['docKeys', docId],
          newKey
        );
        if (!writeKeyResult.success) {
          throw writeKeyResult.error;
        }

        type UpdatedDoc = {
          id: string;
          title: string;
          content: string;
          tags: string;
          createdAt: number;
          updatedAt: number;
          isPublic: boolean;
          access?: DocumentAccessEntry[];
          parent?: string;
          original?: string;
        };

        const updatedDoc: UpdatedDoc = {
          id: doc.id,
          title: encryptedTitle,
          content: encryptedContent,
          tags: encryptedTags,
          createdAt: doc.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          isPublic: false,
        };

        if (doc.access !== undefined) {
          Object.assign(updatedDoc, { access: doc.access });
        }
        if (doc.parent !== undefined) {
          Object.assign(updatedDoc, { parent: doc.parent });
        }
        if (doc.original !== undefined) {
          Object.assign(updatedDoc, { original: doc.original });
        }

        await new Promise<void>((resolve, reject) => {
          docNode.put(updatedDoc, (ack: GunAck) => {
            if (ack.err) {
              reject(
                new Error(`Failed to update document: ${String(ack.err)}`)
              );
            } else {
              resolve();
            }
          });
        });

        return undefined;
      }, transformError)) as Result<void, DocumentError>;

      match(
        () => {
          set({
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          set({
            status: 'READY',
            error: error.message,
          });
        }
      )(result);

      return result;
    },
  })
);
