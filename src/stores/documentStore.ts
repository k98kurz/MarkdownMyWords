/**
 * Document Store
 *
 * Zustand store for document state management using GunDB and SEA encryption.
 * Handles document CRUD, branching, and sharing operations with type-safe error handling.
 */

import { create } from 'zustand';
import { type Result, tryCatch, match } from '../utils/functionalResult';
import type {
  Document,
  DocumentError,
  MinimalDocListItem,
  SharedDocNotification,
} from '../types/document';
import { gunService } from '../services/gunService';
import { encryptionService } from '../services/encryptionService';

const transformError = (error: unknown): DocumentError => {
  if (error instanceof Error) {
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
    if (
      msg.includes('docKey') ||
      msg.includes('permission') ||
      msg.includes('User not authenticated')
    ) {
      return {
        code: 'PERMISSION_DENIED',
        message: 'Document key not found',
        details: error,
      };
    }
    if (
      msg.includes('not found') ||
      msg.includes('Parent document not found') ||
      msg.includes('Not a branch')
    ) {
      return {
        code: 'NOT_FOUND',
        message: 'Document not found',
        details: error,
      };
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

function arrayToCSV(tags: string[] | undefined): string | undefined {
  return tags && tags.length > 0 ? tags.join(',') : undefined;
}

function csvToArray(tags: string | string[] | undefined): string[] | undefined {
  if (!tags) {
    return undefined;
  }
  if (Array.isArray(tags)) {
    return tags;
  }
  return tags.split(',');
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

  // Sharing operations
  shareDocument: (
    docId: string,
    userId: string
  ) => Promise<Result<void, DocumentError>>;
  unshareDocument: (
    docId: string,
    userId: string
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
    ): Promise<Result<Document, DocumentError>> => {
      set({ status: 'LOADING', error: null });

      const result = (await tryCatch(async () => {
        if (!title?.trim()) {
          throw new Error('Title is required');
        }
        if (content === undefined || content === null) {
          throw new Error('Content is required');
        }

        validateTagsNoCommas(tags);

        const validatedIsPublic = isPublic ?? false;
        const docId = gunService.newId();
        const gun = gunService.getGun();
        const userNode = gun.user();

        let docKey: string | undefined;
        let encryptedTitle = title.trim();
        let encryptedContent = content;
        let tagsCSV = arrayToCSV(tags);

        if (!validatedIsPublic) {
          docKey = await encryptionService.generateKey();
          encryptedTitle =
            (await encryptionService.encrypt(title.trim(), docKey)) ??
            title.trim();
          encryptedContent =
            (await encryptionService.encrypt(content, docKey)) ?? content;
          if (tags && tags.length > 0 && tagsCSV) {
            tagsCSV = await encryptionService.encrypt(tagsCSV, docKey!);
          }

          await gunService.writePrivateData(['docKeys', docId], docKey);
        }

        const docNode = userNode.get('docs').get(docId);
        const document: Partial<Document> = {
          id: docId,
          title: encryptedTitle,
          content: encryptedContent,
          tags: tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPublic: validatedIsPublic,
        };

        const documentForStorage = { ...document, tags: tagsCSV };

        await new Promise<void>((resolve, reject) => {
          docNode.put(documentForStorage, (ack: unknown) => {
            if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
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
      docId: string
    ): Promise<Result<Document | null, DocumentError>> => {
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
          try {
            docKey = await gunService.readPrivateData(['docKeys', docId]);
          } catch {
            throw new Error('Document key not found');
          }
        }

        let decryptedTitle = doc.title ?? '';
        let decryptedContent = doc.content ?? '';
        let tagsCSV = doc.tags;
        let tags: string[] = [];

        if (docKey && !doc.isPublic) {
          decryptedTitle =
            (await encryptionService.decrypt(doc.title ?? '', docKey)) ??
            doc.title ??
            '';
          decryptedContent =
            (await encryptionService.decrypt(doc.content ?? '', docKey)) ??
            doc.content ??
            '';
          if (tagsCSV && typeof tagsCSV === 'string') {
            const decryptedTags = await encryptionService.decrypt(
              tagsCSV,
              docKey
            );
            tags = csvToArray(decryptedTags) ?? [];
          }
        } else if (tagsCSV && typeof tagsCSV === 'string') {
          tags = csvToArray(tagsCSV) ?? [];
        }

        const document: Document = {
          id: doc.id,
          title: decryptedTitle,
          content: decryptedContent,
          tags: tags,
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
              (await encryptionService.encrypt(updates.title.trim(), docKey)) ??
              updates.title.trim();
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
          let decryptedTags = updatedDoc.tags ?? [];

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
    ): Promise<Result<Pick<Document, 'title' | 'tags'>, DocumentError>> => {
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
          try {
            docKey = await gunService.readPrivateData(['docKeys', docId]);
          } catch {
            throw new Error('Document key not found');
          }
        }

        let decryptedTitle = doc.title ?? '';
        let decryptedTags = doc.tags ?? [];

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
      }, transformError)) as Result<
        Pick<Document, 'title' | 'tags'>,
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

        const discoveredUsers = await gunService.discoverUsers(userId);
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
          try {
            const docKey = await gunService.readPrivateData(['docKeys', docId]);
            encryptedDocKey =
              (await encryptionService.encryptECDH(docKey, recipientEpub)) ??
              '';
          } catch {
            throw new Error('Document key not found');
          }
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
          docNode.put({ access: updatedAccess }, (ack: unknown) => {
            if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
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
          docNode.put({ access: updatedAccess }, (ack: unknown) => {
            if (ack && typeof ack === 'object' && 'err' in ack && ack.err) {
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
  })
);
