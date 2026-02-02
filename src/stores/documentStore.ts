/**
 * Document Store
 *
 * Zustand store for document state management using GunDB and SEA encryption.
 * Handles document CRUD, branching, and sharing operations with type-safe error handling.
 */

import { create } from 'zustand';
import { type Result, pipe, tryCatch, match } from '../utils/functionalResult';
import type {
  Document,
  DocumentError,
  MinimalDocListItem,
} from '../types/document';
import type { User } from '../types/gun';
import { gunService } from '../services/gunService';
import { encryptionService } from '../services/encryptionService';

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
  status: 'READY' | 'LOADING' | 'SAVING';
  error: string | null;
}

/**
 * Document Actions Interface
 */
interface DocumentActions {
  // Status helpers
  setLoading: () => void;
  setSaving: () => void;
  setReady: () => void;

  // Error helpers
  setError: (error: string) => void;
  clearError: () => void;

  // Document CRUD operations
  createDocument: (
    title: string,
    content: string,
    tags?: string[],
    isPublic?: boolean
  ) => Promise<Result<Document, DocumentError>>;
  getDocument: (
    docId: string
  ) => Promise<Result<Document | null, DocumentError>>;
  updateDocument: (
    docId: string,
    updates: Partial<Pick<Document, 'title' | 'content' | 'tags'>>
  ) => Promise<Result<void, DocumentError>>;
  deleteDocument: (docId: string) => Promise<Result<void, DocumentError>>;
  listDocuments: () => Promise<Result<MinimalDocListItem[], DocumentError>>;
  getDocumentMetadata: (
    docId: string
  ) => Promise<Result<Pick<Document, 'title' | 'tags'>, DocumentError>>;

  // Branch operations
  createBranch: (docId: string) => Promise<Result<string, DocumentError>>;
  getBranch: (
    branchId: string
  ) => Promise<Result<Document | null, DocumentError>>;
  listBranches: (docId: string) => Promise<Result<Document[], DocumentError>>;
  deleteBranch: (branchId: string) => Promise<Result<void, DocumentError>>;

  // Sharing operations
  shareDocument: (
    docId: string,
    userId: string
  ) => Promise<Result<void, DocumentError>>;
  unshareDocument: (
    docId: string,
    userId: string
  ) => Promise<Result<void, DocumentError>>;
  getSharedDocuments: () => Promise<Result<Document[], DocumentError>>;
  getCollaborators: (docId: string) => Promise<Result<User[], DocumentError>>;
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
    status: 'READY',
    error: null,

    // Status helpers
    setLoading: () => set({ status: 'LOADING', error: null }),
    setSaving: () => set({ status: 'SAVING', error: null }),
    setReady: () => set({ status: 'READY' }),

    // Error helpers
    setError: (error: string) => set({ status: 'READY', error }),
    clearError: () => set({ error: null }),

    createDocument: async (
      title: string,
      content: string,
      tags?: string[],
      isPublic?: boolean
    ) => {
      set({ status: 'LOADING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (error.message.includes('encryption')) {
            return {
              code: 'ENCRYPTION_ERROR',
              message: 'Failed to encrypt document',
              details: error,
            };
          }
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to write')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to save document',
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
          if (!title?.trim()) {
            throw new Error('Title is required');
          }
          if (content === undefined || content === null) {
            throw new Error('Content is required');
          }

          const validatedIsPublic = isPublic ?? false;
          const docId = gunService.newId();
          const gun = gunService.getGun();
          const userNode = gun.user();

          let docKey: string | undefined;
          let encryptedTitle = title.trim();
          let encryptedContent = content;
          let encryptedTags = tags;

          if (!validatedIsPublic) {
            docKey = await encryptionService.generateKey();
            encryptedTitle =
              (await encryptionService.encrypt(title.trim(), docKey)) ??
              title.trim();
            encryptedContent =
              (await encryptionService.encrypt(content, docKey)) ?? content;
            if (tags) {
              encryptedTags = await Promise.all(
                tags.map(
                  async (tag: string) =>
                    (await encryptionService.encrypt(tag, docKey!)) ?? tag
                )
              );
            }

            await gunService.writePrivateData(['docKeys', docId], docKey);
          }

          const docNode = userNode.get('docs').get(docId);
          const document: Document = {
            id: docId,
            title: encryptedTitle,
            content: encryptedContent,
            tags: encryptedTags,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPublic: validatedIsPublic,
            access: [],
          };

          await new Promise<void>((resolve, reject) => {
            docNode.put(document, (ack: unknown) => {
              if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
                reject(
                  new Error(`Failed to save document: ${String(ack.err)}`)
                );
              } else {
                resolve();
              }
            });
          });

          return document;
        }, transformError)
      );

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

    getDocument: async (docId: string) => {
      set({ status: 'LOADING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (error.message.includes('decryption')) {
            return {
              code: 'ENCRYPTION_ERROR',
              message: 'Failed to decrypt document',
              details: error,
            };
          }
          if (
            error.message.includes('not found') ||
            error.message.includes('could not be decrypted')
          ) {
            return {
              code: 'NOT_FOUND',
              message: 'Document not found',
              details: error,
            };
          }
          if (
            error.message.includes('docKey') ||
            error.message.includes('permission')
          ) {
            return {
              code: 'PERMISSION_DENIED',
              message: 'Document key not found',
              details: error,
            };
          }
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to read')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to retrieve document',
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
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
            try {
              docKey = await gunService.readPrivateData(['docKeys', docId]);
            } catch {
              throw new Error('Document key not found');
            }
          }

          let decryptedTitle = doc.title ?? '';
          let decryptedContent = doc.content ?? '';
          let decryptedTags = doc.tags;

          if (docKey && !doc.isPublic) {
            decryptedTitle =
              (await encryptionService.decrypt(doc.title ?? '', docKey)) ??
              doc.title ??
              '';
            decryptedContent =
              (await encryptionService.decrypt(doc.content ?? '', docKey)) ??
              doc.content ??
              '';
            if (doc.tags) {
              decryptedTags = await Promise.all(
                doc.tags.map(
                  async (tag: string) =>
                    (await encryptionService.decrypt(tag, docKey!)) ?? tag
                )
              );
            }
          }

          const document: Document = {
            id: doc.id,
            title: decryptedTitle,
            content: decryptedContent,
            tags: decryptedTags,
            createdAt: doc.createdAt ?? Date.now(),
            updatedAt: doc.updatedAt ?? Date.now(),
            isPublic: doc.isPublic ?? false,
            access: doc.access ?? [],
            parent: doc.parent,
            original: doc.original,
          };

          return document;
        }, transformError)
      );

      match(
        (doc: Document | null) => {
          set({
            currentDocument: doc,
            status: 'READY',
            error: null,
          });
        },
        (error: DocumentError) => {
          if (error.code === 'NOT_FOUND') {
            set({
              currentDocument: null,
              status: 'READY',
              error: null,
            });
          } else {
            set({
              status: 'READY',
              error: error.message,
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
    ) => {
      set({ status: 'SAVING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return {
              code: 'NOT_FOUND',
              message: 'Document not found',
              details: error,
            };
          }
          if (
            error.message.includes('docKey') ||
            error.message.includes('permission')
          ) {
            return {
              code: 'PERMISSION_DENIED',
              message: 'Document key not found',
              details: error,
            };
          }
          if (
            error.message.includes('encryption') ||
            error.message.includes('decryption')
          ) {
            return {
              code: 'ENCRYPTION_ERROR',
              message: 'Failed to encrypt document',
              details: error,
            };
          }
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to update')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to update document',
              details: error,
            };
          }
          if (error.message.includes('validation')) {
            return {
              code: 'VALIDATION_ERROR',
              message: error.message,
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
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
            try {
              docKey = await gunService.readPrivateData(['docKeys', docId]);
            } catch {
              throw new Error('Document key not found');
            }
          }

          const currentDoc = get();
          const isCurrentDoc = currentDoc.currentDocument?.id === docId;

          let updatedDoc: Partial<Document> = { ...doc };

          if (updates.title !== undefined) {
            if (!updates.title?.trim()) {
              throw new Error('Title cannot be empty');
            }
            if (docKey && !doc.isPublic) {
              updatedDoc.title =
                (await encryptionService.encrypt(
                  updates.title.trim(),
                  docKey
                )) ?? updates.title.trim();
            } else {
              updatedDoc.title = updates.title.trim();
            }
          }

          if (updates.content !== undefined) {
            if (docKey && !doc.isPublic) {
              updatedDoc.content =
                (await encryptionService.encrypt(updates.content, docKey)) ??
                updates.content;
            } else {
              updatedDoc.content = updates.content;
            }
          }

          if (updates.tags !== undefined) {
            if (docKey && !doc.isPublic) {
              updatedDoc.tags = await Promise.all(
                updates.tags.map(
                  async (tag: string) =>
                    (await encryptionService.encrypt(tag, docKey!)) ?? tag
                )
              );
            } else {
              updatedDoc.tags = updates.tags;
            }
          }

          updatedDoc.updatedAt = Date.now();

          await new Promise<void>((resolve, reject) => {
            docNode.put(updatedDoc, (ack: unknown) => {
              if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
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
            let decryptedTags = updatedDoc.tags;

            if (docKey && !doc.isPublic) {
              decryptedTitle =
                (await encryptionService.decrypt(
                  updatedDoc.title ?? '',
                  docKey
                )) ??
                updatedDoc.title ??
                '';
              decryptedContent =
                (await encryptionService.decrypt(
                  updatedDoc.content ?? '',
                  docKey
                )) ??
                updatedDoc.content ??
                '';
              if (updatedDoc.tags) {
                decryptedTags = await Promise.all(
                  updatedDoc.tags.map(
                    async (tag: string) =>
                      (await encryptionService.decrypt(tag, docKey!)) ?? tag
                  )
                );
              }
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
        }, transformError)
      );

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

    deleteDocument: async (docId: string) => {
      set({ status: 'LOADING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return {
              code: 'NOT_FOUND',
              message: 'Document not found',
              details: error,
            };
          }
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to delete')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to delete document',
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
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
            docNode.put(null, (ack: unknown) => {
              if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
                reject(
                  new Error(`Failed to delete document: ${String(ack.err)}`)
                );
              } else {
                resolve();
              }
            });
          });

          if (!doc.isPublic) {
            const privatePath = await gunService['getPrivatePath']([
              'docKeys',
              docId,
            ]);
            let privateNode: unknown = userNode;
            for (const part of privatePath) {
              const getNode = (privateNode as Record<string, unknown>).get as (
                key: string
              ) => unknown;
              privateNode = getNode(part);
            }

            await new Promise<void>((resolve, reject) => {
              const putNode = privateNode as {
                put: (data: unknown, cb?: (ack: unknown) => void) => void;
              };
              putNode.put(null, (ack: unknown) => {
                if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
                  reject(
                    new Error(
                      `Failed to delete document key: ${String(ack.err)}`
                    )
                  );
                } else {
                  resolve();
                }
              });
            });
          }

          return undefined;
        }, transformError)
      );

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

    listDocuments: async () => {
      set({ status: 'LOADING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to list')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to retrieve document list',
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
          const items = await gunService.listUserItems(['docs']);

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
              };
            })
            .filter((item): item is MinimalDocListItem => item !== null);

          return minimalDocs;
        }, transformError)
      );

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

    getDocumentMetadata: async (docId: string) => {
      set({ status: 'LOADING', error: null });

      const transformError = (error: unknown): DocumentError => {
        if (error instanceof Error) {
          if (error.message.includes('decryption')) {
            return {
              code: 'ENCRYPTION_ERROR',
              message: 'Failed to decrypt document metadata',
              details: error,
            };
          }
          if (
            error.message.includes('not found') ||
            error.message.includes('could not be decrypted')
          ) {
            return {
              code: 'NOT_FOUND',
              message: 'Document not found',
              details: error,
            };
          }
          if (
            error.message.includes('docKey') ||
            error.message.includes('permission')
          ) {
            return {
              code: 'PERMISSION_DENIED',
              message: 'Document key not found',
              details: error,
            };
          }
          if (
            error.message.includes('GunDB') ||
            error.message.includes('Failed to read')
          ) {
            return {
              code: 'NETWORK_ERROR',
              message: 'Failed to retrieve document metadata',
              details: error,
            };
          }
          return {
            code: 'NETWORK_ERROR',
            message: error.message,
            details: error,
          };
        }
        return {
          code: 'NETWORK_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        };
      };

      const result = await pipe(
        tryCatch(async () => {
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
            try {
              docKey = await gunService.readPrivateData(['docKeys', docId]);
            } catch {
              throw new Error('Document key not found');
            }
          }

          let decryptedTitle = doc.title ?? '';
          let decryptedTags = doc.tags;

          if (docKey && !doc.isPublic) {
            decryptedTitle =
              (await encryptionService.decrypt(doc.title ?? '', docKey)) ??
              doc.title ??
              '';
            if (doc.tags) {
              decryptedTags = await Promise.all(
                doc.tags.map(
                  async (tag: string) =>
                    (await encryptionService.decrypt(tag, docKey!)) ?? tag
                )
              );
            }
          }

          const metadata: Pick<Document, 'title' | 'tags'> = {
            title: decryptedTitle,
            tags: decryptedTags,
          };

          return metadata;
        }, transformError)
      );

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

    createBranch: async (_docId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    getBranch: async (_branchId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    listBranches: async (_docId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    deleteBranch: async (_branchId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    shareDocument: async (_docId: string, _userId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    unshareDocument: async (_docId: string, _userId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    getSharedDocuments: async () => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },

    getCollaborators: async (_docId: string) => {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Not implemented',
        },
      };
    },
  })
);
