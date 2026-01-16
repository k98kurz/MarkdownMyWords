# Document Store Implementation Plan

## Goal

Create `src/store/documentStore.ts` with user-scoped storage architecture to handle document state management and service orchestration.

## Current Status

- ✅ gunService.ts already cleaned (document methods removed)
- ❌ documentStore.ts doesn't exist yet
- ❌ UI components can't access documents (no store exists)

## New Architecture

### Storage Pattern

**Documents:** `gun.user().get('docs').get(docId)`

```typescript
interface Document {
  title: string,           // encrypted with docKey if !isPublic
  content: string,         // encrypted with docKey if !isPublic
  tags?: string[],         // encrypted with docKey if !isPublic
  original?: string,       // parent doc soul
  parent?: string,         // parent doc soul
  createdAt: number,
  updatedAt: number,
  isPublic: boolean,      // whether or not to encrypt the document
  access: {               // accessible via .map()
    userId: string,
    docKey: string        // encrypted with SEA ECDH
  }[]
}
```

**Keys:** `writePrivateData(['docKeys', docId], docKey)`
**Branches:** Relationship of branches is maintained through `parent` and `original` "souls"

### documentStore.ts Design

```typescript
interface DocumentState {
  currentDocument: Document | null
  status: {
    loading: boolean
    saving: boolean
    sharing: boolean
  }
  error: string | null
}

interface DocumentActions {
  // Document CRUD
  createDocument: (title: string, content: string, tags?: string[], isPublic?: boolean) => Promise<Document | Error>
  getDocument: (docId: string) => Promise<Document | null>
  updateDocument: (docId: string, updates: Partial<Document>) => Promise<void>
  deleteDocument: (docId: string) => Promise<void>
  listDocuments: () => Promise<Document[]>

  // Branch operations
  createBranch: (docId: string, content: string, description?: string) => Promise<string>
  getBranch: (branchId: string) => Promise<Branch | null>
  deleteBranch: (branchId: string) => Promise<void>
  listBranches: (docId: string) => Promise<Branch[]>

  // Sharing operations
  shareDocument: (docId: string, recipientPub: string) => Promise<void>
  unshareDocument: (docId: string, userId: string) => Promise<void>
  getSharedDocuments: () => Promise<Document[]>
  getCollaborators: (docId: string) => Promise<User[]>

  // State management
  setCurrentDocument: (document: Document | null) => void
  clearError: () => void
}
```

## Implementation Steps

### 1. Create documentStore.ts

- Set up Zustand store with DocumentState + DocumentActions
- Implement core CRUD operations using storage pattern
- Add proper error handling and loading states
- Use gunService + encryptionService for orchestration

### 2. Update Type Definitions

- Add new Document, Branch interfaces for architecture
- Clean up unused imports and definitions

### 3. Update UI Components

- Replace direct gunService calls with useDocumentStore
- Update components that create/edit documents
- Add proper loading states and error handling

### 4. Testing & Cleanup

- Test document CRUD operations work end-to-end
- Verify branch creation and sharing functionality
- Remove any remaining references to old document methods

## Implementation Notes: Branches

- Relationship between branches is determined with `parent` and `original`:
  - If a document has no parent, it is an original
  - If a document has a parent, then it is a branch
- Branches inherit the isPublic from the parent; the app will not allow this
  to be changed
- Document access cannot be defined on a branch, but anyone with access to the
  original will have access to the branches since they share the same dockey

## Key Implementation Pattern

```typescript
// Example: createDocument implementation
createDocument: async (title, content, tags?: string[], isPublic: boolean = false) => {
  try {
    const docId = gunService.newId()
    const docKey = await encryptionService.generateKey()
    const encryptedTitle = isPublic ? title : await encryptionService.encrypt(title, docKey)
    const encryptedContent = isPublic ? content : await encryptionService.encrypt(content, docKey)

    if (!isPublic) await gunService.writePrivateData(['docKeys', docId], docKey)
    await gun.user().get('docs').get(docId).put({
      title: encryptedTitle,
      content: encryptedContent,
      isPublic: isPublic,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    if (tags && tags.length > 0) {
      const encryptedTags = isPublic ? tags : await Promise.all(tags.map(t => encryptionService.encrypt(t, docKey)))
      await gun.user().get('docs').get(docId).get('tags').put(encryptedTags)
    }

    set({ currentDocument: {id: docId, title, content, ...} })
    return docId
  } catch (error) {
    const errorMessage = error.message ?? String(error)
    set({ error: errorMessage, ... })
  }
}
```

## Benefits

- **Security**: User-scoped storage eliminates global namespace vulnerabilities
- **Clean Architecture**: Clear separation between storage and business logic
- **State Management**: Zustand store with consistent patterns
- **Features**: Built-in sharing with SEA ECDH from day one
