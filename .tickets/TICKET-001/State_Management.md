# State Management Strategy

## Overview

MarkdownMyWords uses Zustand for state management, providing a simple, lightweight solution for global state with excellent TypeScript support.

## State Architecture

### Store Structure

```
Zustand Stores
│
├── authStore (Authentication)
│   ├── User data
│   ├── Encryption keys
│   └── Auth state
│
├── documentStore (Documents)
│   ├── Document list
│   ├── Current document
│   └── Document operations
│
├── uiStore (UI State)
│   ├── Theme
│   ├── Sidebar visibility
│   └── Editor mode
│
└── sharingStore (Sharing)
    ├── Collaborators
    └── Branches
```

## Store Definitions

### Auth Store

```typescript
interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  userKey: CryptoKey | null;
  isLoading: boolean;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  deriveKey: (username: string, password: string) => Promise<CryptoKey>;
  setUser: (user: User) => void;
  setUserKey: (key: CryptoKey | null) => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  userKey: null,
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const key = await get().deriveKey(username, password);
      const user = await gunService.authenticate(username, password);
      set({ user, userKey: key, isAuthenticated: true });
    } catch (error) {
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: () => {
    // Clear key from memory
    if (get().userKey) {
      // Key will be garbage collected
    }
    set({ user: null, userKey: null, isAuthenticated: false });
  },

  deriveKey: async (username, password) => {
    const salt = await gunService.getUserSalt(username);
    return await encryptionService.deriveKey(username, password, salt);
  },

  setUser: (user) => set({ user }),
  setUserKey: (key) => set({ userKey: key })
}));
```

### Document Store

```typescript
interface DocumentState {
  // State
  documents: Document[];
  currentDocId: string | null;
  currentContent: string;
  isLoading: boolean;
  isSaving: boolean;

  // Actions
  loadDocuments: () => Promise<void>;
  loadDocument: (docId: string) => Promise<void>;
  createDocument: (title: string) => Promise<string>;
  updateDocument: (docId: string, content: string) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
  setCurrentDocId: (docId: string | null) => void;
  setCurrentContent: (content: string) => void;
}

const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocId: null,
  currentContent: '',
  isLoading: false,
  isSaving: false,

  loadDocuments: async () => {
    set({ isLoading: true });
    try {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) throw new Error('Not authenticated');

      const docs = await gunService.listDocuments(userId);
      set({ documents: docs });
    } finally {
      set({ isLoading: false });
    }
  },

  loadDocument: async (docId) => {
    set({ isLoading: true });
    try {
      const doc = await gunService.getDocument(docId);
      if (!doc) throw new Error('Document not found');

      const userKey = useAuthStore.getState().userKey;
      if (!userKey) throw new Error('Not authenticated');

      const content = await encryptionService.decryptDocument(
        { encryptedContent: doc.encryptedContent, contentIV: doc.contentIV },
        userKey
      );

      set({ currentDocId: docId, currentContent: content });
    } finally {
      set({ isLoading: false });
    }
  },

  createDocument: async (title) => {
    const userKey = useAuthStore.getState().userKey;
    if (!userKey) throw new Error('Not authenticated');

    const content = '';
    const encrypted = await encryptionService.encryptDocument(content, userKey);
    const docId = await gunService.createDocument(title, encrypted);

    await get().loadDocuments();
    return docId;
  },

  updateDocument: async (docId, content) => {
    set({ isSaving: true });
    try {
      const userKey = useAuthStore.getState().userKey;
      if (!userKey) throw new Error('Not authenticated');

      const encrypted = await encryptionService.encryptDocument(content, userKey);
      await gunService.updateDocument(docId, encrypted);

      set({ currentContent: content });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteDocument: async (docId) => {
    await gunService.deleteDocument(docId);
    await get().loadDocuments();
    if (get().currentDocId === docId) {
      set({ currentDocId: null, currentContent: '' });
    }
  },

  setCurrentDocId: (docId) => set({ currentDocId: docId }),
  setCurrentContent: (content) => set({ currentContent: content })
}));
```

### UI Store

```typescript
interface UIState {
  // State
  theme: 'light' | 'dark';
  sidebarVisible: boolean;
  editorMode: 'edit' | 'preview' | 'split';
  aiSidebarOpen: boolean;
  sharingSidebarOpen: boolean;

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setEditorMode: (mode: 'edit' | 'preview' | 'split') => void;
  setAISidebarOpen: (open: boolean) => void;
  setSharingSidebarOpen: (open: boolean) => void;
}

const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  sidebarVisible: true,
  editorMode: 'split',
  aiSidebarOpen: false,
  sharingSidebarOpen: false,

  setTheme: (theme) => {
    set({ theme });
    document.documentElement.setAttribute('data-theme', theme);
    // Persist to GunDB
  },

  toggleTheme: () => {
    const current = useUIStore.getState().theme;
    useUIStore.getState().setTheme(current === 'light' ? 'dark' : 'light');
  },

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setAISidebarOpen: (open) => set({ aiSidebarOpen: open }),
  setSharingSidebarOpen: (open) => set({ sharingSidebarOpen: open })
}));
```

### Sharing Store

```typescript
interface SharingState {
  // State
  collaborators: Collaborator[];
  pendingBranches: Branch[];
  isLoading: boolean;

  // Actions
  loadCollaborators: (docId: string) => Promise<void>;
  loadBranches: (docId: string) => Promise<void>;
  addCollaborator: (docId: string, userId: string, accessLevel: 'read' | 'write') => Promise<void>;
  removeCollaborator: (docId: string, userId: string) => Promise<void>;
  mergeBranch: (docId: string, branchId: string) => Promise<void>;
  rejectBranch: (branchId: string, reason?: string) => Promise<void>;
}

const useSharingStore = create<SharingState>((set, get) => ({
  collaborators: [],
  pendingBranches: [],
  isLoading: false,

  loadCollaborators: async (docId) => {
    set({ isLoading: true });
    try {
      const doc = await gunService.getDocument(docId);
      if (!doc) return;

      const collaborators = await Promise.all(
        doc.sharing.readAccess
          .concat(doc.sharing.writeAccess)
          .map(async (userId) => {
            const user = await gunService.getUser(userId);
            return {
              userId,
              username: user?.username || userId,
              accessLevel: doc.sharing.writeAccess.includes(userId) ? 'write' : 'read'
            };
          })
      );

      set({ collaborators });
    } finally {
      set({ isLoading: false });
    }
  },

  loadBranches: async (docId) => {
    const branches = await branchService.getBranches(docId, 'pending');
    set({ pendingBranches: branches });
  },

  addCollaborator: async (docId, userId, accessLevel) => {
    await gunService.shareDocument(docId, userId, accessLevel);
    await get().loadCollaborators(docId);
  },

  removeCollaborator: async (docId, userId) => {
    await gunService.revokeAccess(docId, userId);
    await get().loadCollaborators(docId);
  },

  mergeBranch: async (docId, branchId) => {
    await branchService.mergeBranch(docId, branchId);
    await get().loadBranches(docId);
    // Reload document to get updated content
    await useDocumentStore.getState().loadDocument(docId);
  },

  rejectBranch: async (branchId, reason) => {
    await branchService.rejectBranch(branchId, reason);
    const docId = useDocumentStore.getState().currentDocId;
    if (docId) {
      await get().loadBranches(docId);
    }
  }
}));
```

## State Synchronization

### GunDB Subscriptions

```typescript
// Subscribe to document changes
useEffect(() => {
  const docId = useDocumentStore.getState().currentDocId;
  if (!docId) return;

  const unsubscribe = gunService.subscribeToDocument(docId, (doc) => {
    // Update store when document changes
    const userKey = useAuthStore.getState().userKey;
    if (userKey) {
      encryptionService.decryptDocument(doc.encryptedContent, userKey)
        .then(content => {
          useDocumentStore.getState().setCurrentContent(content);
        });
    }
  });

  return unsubscribe;
}, [docId]);
```

### Optimistic Updates

```typescript
// Update UI immediately, sync in background
updateDocument: async (docId, content) => {
  // Optimistic update
  set({ currentContent: content, isSaving: true });

  try {
    // Actual update
    const encrypted = await encryptionService.encryptDocument(content, userKey);
    await gunService.updateDocument(docId, encrypted);
  } catch (error) {
    // Revert on error
    await get().loadDocument(docId);
    throw error;
  } finally {
    set({ isSaving: false });
  }
}
```

## State Persistence

### Theme Persistence

```typescript
// Load theme on mount
useEffect(() => {
  gunService.getUserSettings().then(settings => {
    if (settings.theme) {
      useUIStore.getState().setTheme(settings.theme);
    }
  });
}, []);

// Save theme on change
useEffect(() => {
  const theme = useUIStore.getState().theme;
  gunService.updateUserSettings({ theme });
}, [theme]);
```

### Document List Caching

```typescript
// Cache document list in IndexedDB
const cacheDocuments = async (documents: Document[]) => {
  await storageService.set('documents', documents);
};

const loadCachedDocuments = async (): Promise<Document[]> => {
  return await storageService.get('documents') || [];
};
```

## State Selectors

### Memoized Selectors

```typescript
// Select current document
const currentDocument = useDocumentStore(
  (state) => state.documents.find(d => d.id === state.currentDocId)
);

// Select pending branches count
const pendingBranchesCount = useSharingStore(
  (state) => state.pendingBranches.length
);
```

## Best Practices

1. **Keep Stores Focused**: Each store handles one domain
2. **Use Selectors**: Memoize derived state
3. **Optimistic Updates**: Update UI immediately
4. **Error Handling**: Handle errors in actions
5. **Loading States**: Track loading/saving states
6. **Subscriptions**: Subscribe to GunDB changes
7. **Persistence**: Persist important state
