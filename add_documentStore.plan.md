# Document Store Implementation Plan

## Goal

Create `src/store/documentStore.ts` with user-scoped storage architecture to handle document state management and service orchestration using the functionalResult utility for type-safe error handling.

## Status

- ❌ **Phase 1**: Foundation & Types (pending)
- ❌ **Phase 2**: Core CRUD Operations (pending)
- ❌ **Phase 3**: Document Listing & Metadata (pending)
- ❌ **Phase 4**: Branch Operations (pending)
- ❌ **Phase 5**: Sharing Operations (pending)
- ❌ **Phase 6**: UI Integration (pending)

## Current Status

- ✅ gunService.ts already cleaned (document methods removed)
- ❌ documentStore.ts doesn't exist yet
- ❌ UI components can't access documents (no store exists)

## New Architecture

### functionalResult Integration Requirement

**All async operations must return `Result<T, DocumentError>`** using the functionalResult utility. State updates will unwrap Results internally to keep Zustand state clean.

### DocumentError Type

```typescript
interface DocumentError {
  code:
    | 'NETWORK_ERROR'
    | 'ENCRYPTION_ERROR'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
  message: string
  details?: unknown
}
```

### Storage Pattern

**Documents:** `gun.user().get('docs').get(docId)`

```typescript
interface Document {
  id: string // docId
  title: string // encrypted with docKey if !isPublic
  content: string // encrypted with docKey if !isPublic
  tags?: string[] // encrypted with docKey if !isPublic
  original?: string // parent doc soul
  parent?: string // parent doc soul
  createdAt: number
  updatedAt: number
  isPublic: boolean // whether or not to encrypt the document
  access: {
    // accessible via .map()
    userId: string
    docKey: string // encrypted with SEA ECDH
  }[]
}
```

**Keys:** `writePrivateData(['docKeys', docId], docKey)`
**Branches:** Relationship of branches is maintained through `parent` and `original` "souls"

### documentStore.ts Design

```typescript
interface DocumentState {
  currentDocument: Document | null
  documentList: Array<{
    docId: string
    soul: string
    createdAt: number
    updatedAt: number
    title?: string // Lazy loaded via getDocumentMetadata
    tags?: string[] // Lazy loaded via getDocumentMetadata
  }>
  status: 'READY' | 'LOADING' | 'SAVING'
  error: string | null // Store unwrapped error messages for UI
}

interface DocumentActions {
  // Core CRUD - All return Result<T, DocumentError>
  createDocument: (
    title: string,
    content: string,
    tags?: string[],
    isPublic?: boolean
  ) => Promise<Result<Document, DocumentError>>
  getDocument: (docId: string) => Promise<Result<Document | null, DocumentError>>
  updateDocument: (
    docId: string,
    updates: Partial<Document>
  ) => Promise<Result<void, DocumentError>>
  deleteDocument: (docId: string) => Promise<Result<void, DocumentError>>

  // Efficient listing system
  listDocuments: () => Promise<
    Result<
      Array<{ docId: string; soul: string; createdAt: number; updatedAt: number }>,
      DocumentError
    >
  >
  getDocumentMetadata: (
    docId: string
  ) => Promise<Result<{ title: string; tags: string[] }, DocumentError>>

  // Branch operations - All return Result<T, DocumentError>
  createBranch: (
    docId: string,
    content: string,
    description?: string
  ) => Promise<Result<string, DocumentError>>
  getBranch: (branchId: string) => Promise<Result<Document | null, DocumentError>>
  deleteBranch: (branchId: string) => Promise<Result<void, DocumentError>>
  listBranches: (docId: string) => Promise<Result<Document[], DocumentError>>

  // Sharing operations - All return Result<T, DocumentError>
  shareDocument: (docId: string, recipientPub: string) => Promise<Result<void, DocumentError>>
  unshareDocument: (docId: string, userId: string) => Promise<Result<void, DocumentError>>
  getSharedDocuments: () => Promise<Result<Document[], DocumentError>>
  getCollaborators: (docId: string) => Promise<Result<User[], DocumentError>>

  // State management (no Result needed for state setters)
  setCurrentDocument: (document: Document | null) => void
  clearError: () => void
}
```

## Implementation Phases

### Phase 1: Foundation & Types

**Status: pending**

**Tasks:**

- Create DocumentError interface with specific error codes
- Add Document, DocumentState, DocumentActions type definitions
- Set up basic Zustand store structure with functionalResult imports
- Create placeholder methods that return proper Result types
- Update type definitions and clean up unused imports

**Deliverables:**

- `src/types/document.ts` with DocumentError and Document interfaces
- Basic `src/store/documentStore.ts` with state shape and placeholder methods
- Updated type definitions

---

### Phase 2: Core CRUD Operations

**Status: pending**

**Tasks:**

- Implement `createDocument()` with encryption and storage
- Implement `getDocument()` with decryption
- Implement `updateDocument()` with proper validation
- Implement `deleteDocument()` with cleanup
- Ensure all methods return proper `Result<T, DocumentError>`
- Add state unwrapping for clean UI integration

**Deliverables:**

- Fully functional CRUD operations
- Proper error handling and transformation
- State management integration

---

### Phase 3: Document Listing & Metadata

**Status: pending**

**Tasks:**

- Implement `listDocuments()` for fast minimal listing
- Implement `getDocumentMetadata()` for lazy title/tag loading
- Add two-phase loading logic for performance
- Implement `setCurrentDocument()` and `clearError()` state methods
- Test performance with multiple documents

**Deliverables:**

- Efficient document listing system
- Progressive metadata loading
- Performance-optimized state management

---

### Phase 4: Branch Operations

**Status: pending**

**Tasks:**

- Implement `createBranch()` with parent/origin tracking
- Implement `getBranch()` for branch retrieval
- Implement `deleteBranch()` with proper cleanup
- Implement `listBranches()` for branch discovery
- Handle branch inheritance rules (isPublic, access)

**Deliverables:**

- Complete branching system
- Parent/origin relationship management
- Branch-specific validation logic

---

### Phase 5: Sharing Operations

**Status: pending**

**Tasks:**

- Implement `shareDocument()` using SEA ECDH
- Implement `unshareDocument()` with access cleanup
- Implement `getSharedDocuments()` for shared content discovery
- Implement `getCollaborators()` for user listing
- Test sharing workflow end-to-end

**Deliverables:**

- Secure document sharing system
- Collaborator management
- Shared document discovery

---

### Phase 6: UI Integration

**Status: pending**

**Tasks:**

- Replace direct gunService calls with useDocumentStore
- Update components to handle Result types from store methods
- Add proper loading states and error handling
- Implement progressive loading for document lists
- Test complete UI workflow

**Deliverables:**

- Updated UI components
- Proper error handling in UI
- Progressive loading implementation
- End-to-end testing verification

## Implementation Notes

### Branches

- Relationship between branches is determined with `parent` and `original`:
  - If a document has no parent, it is an original
  - If a document has a parent, then it is a branch
- Branches inherit the isPublic from the parent; the app will not allow this to be changed
- Document access cannot be defined on a branch, but anyone with access to the original will have access to the branches since they share the same dockey

### Two-Phase Loading Strategy

**Phase 1: Fast Listing (`listDocuments`)**

- Returns minimal document data: `{docId, soul, createdAt, updatedAt}`
- Uses existing `gunService.listUserItems(['docs'])` pattern
- No decryption required for basic metadata
- Ideal for document browser UI with lazy loading

**Phase 2: Metadata Loading (`getDocumentMetadata`)**

- Decrypts only title and tags for selected documents
- Retrieves document key from private storage if needed
- Progressive loading improves perceived performance
- Avoids decrypting full content until explicitly requested

### Performance Benefits

- **Scalability**: Works efficiently with hundreds/thousands of documents
- **Memory Efficiency**: Only decrypts content when actually needed
- **Progressive Enhancement**: UI can render list immediately, enrich with titles on-demand
- **Reduced Bandwidth**: Minimal data transfer for initial listing

### Status Management

- **Single Status Field**: `status: 'READY' | 'LOADING' | 'SAVING'`
- **No Race Conditions**: Eliminates multiple boolean flags that could conflict
- **Clear UI States**: Components can easily determine what to show based on single status
- **Consistent Pattern**: Matches existing Zustand store patterns in codebase

## functionalResult Integration Notes

- **All async operations return `Result<T, DocumentError>`**
- **State unwrapping**: Store methods unwrap Results before updating Zustand state
- **Error transformation**: Convert service layer errors to DocumentError format
- **Composition**: Use `pipe` for complex operations, `tryCatch` for error boundaries
- **Type safety**: Leverage TypeScript discriminated unions for Result handling
- **UI integration**: Components can either handle Results directly or rely on state updates

## Phase-Specific Implementation Patterns

### Phase 2: Core CRUD Example

```typescript
import { success, failure, tryCatch, pipe, map, chain } from '../utils/functionalResult'
import type { Result } from '../utils/functionalResult'

createDocument: async (
  title: string,
  content: string,
  tags?: string[],
  isPublic: boolean = false
) => {
  set({ status: 'SAVING', error: null })

  const result = await pipe(
    // Validate inputs
    tryCatch(
      () => {
        if (!title?.trim()) throw { code: 'VALIDATION_ERROR', message: 'Title is required' }
        if (!content?.trim()) throw { code: 'VALIDATION_ERROR', message: 'Content is required' }
        return { title: title.trim(), content: content.trim(), tags, isPublic }
      },
      error => ({ code: 'VALIDATION_ERROR', message: error.message, details: error })
    ),

    // Generate document key
    chain(() =>
      tryCatch(
        () => encryptionService.generateKey(),
        error => ({
          code: 'ENCRYPTION_ERROR',
          message: 'Failed to generate document key',
          details: error,
        })
      )
    ),

    // Encrypt content if not public
    chain(docKey =>
      tryCatch(
        async () => {
          const encryptedTitle = isPublic ? title : await encryptionService.encrypt(title, docKey)
          const encryptedContent = isPublic
            ? content
            : await encryptionService.encrypt(content, docKey)
          const encryptedTags = tags
            ? isPublic
              ? tags
              : await Promise.all(tags.map(t => encryptionService.encrypt(t, docKey)))
            : []
          return { encryptedTitle, encryptedContent, encryptedTags, docKey }
        },
        error => ({
          code: 'ENCRYPTION_ERROR',
          message: 'Failed to encrypt document',
          details: error,
        })
      )
    ),

    // Save to GunDB
    chain(({ encryptedTitle, encryptedContent, encryptedTags, docKey }) =>
      tryCatch(
        async () => {
          const docId = gunService.newId()

          // Save document key if not public
          if (!isPublic) {
            await gunService.writePrivateData(['docKeys', docId], docKey)
          }

          // Save document
          await gun.user().get('docs').get(docId).put({
            title: encryptedTitle,
            content: encryptedContent,
            isPublic: isPublic,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })

          // Save tags if provided - use .set() for arrays
          if (encryptedTags.length > 0) {
            const tagsNode = gun.user().get('docs').get(docId).get('tags')
            encryptedTags.forEach((tag, index) => {
              tagsNode.get(index.toString()).put(tag)
            })
          }

          return {
            id: docId,
            title,
            content,
            tags,
            isPublic,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        },
        error => ({ code: 'NETWORK_ERROR', message: 'Failed to save document', details: error })
      )
    )
  )

  // Unwrap Result and update state
  if (result.success) {
    set({
      currentDocument: result.data,
      status: 'READY',
      error: null,
    })
  } else {
    const errorMessage = result.error.message || 'Failed to create document'
    set({
      status: 'READY',
      error: errorMessage,
    })
  }

  return result // Return Result for caller to handle
}
```

### Phase 3: Two-Phase Loading Example

```typescript
// Fast document listing - minimal data
listDocuments: async () => {
  set({ status: 'LOADING', error: null })

  const result = await pipe(
    tryCatch(
      () => gunService.listUserItems(['docs']),
      error => ({ code: 'NETWORK_ERROR', message: 'Failed to list documents', details: error })
    ),
    map(items =>
      items.map(item => ({
        docId: item.soul,
        soul: item.soul,
        createdAt: item.data.createdAt || 0,
        updatedAt: item.data.updatedAt || 0,
      }))
    )
  )

  // Update state with unwrapped result
  if (result.success) {
    set({
      documentList: result.data,
      status: 'READY',
      error: null,
    })
  } else {
    set({
      status: 'READY',
      error: result.error.message || 'Failed to list documents',
    })
  }

  return result
}

// Lazy metadata loading for document titles/tags
getDocumentMetadata: async (docId: string) => {
  return await pipe(
    tryCatch(
      () => gunService.readUser(['docs', docId]),
      error => ({ code: 'NOT_FOUND', message: 'Document not found', details: error })
    ),
    chain(async docData => {
      if (!docData?.title) {
        return failure({ code: 'NOT_FOUND', message: 'Invalid document data' })
      }

      // Decrypt title and tags only if not public
      if (docData.isPublic) {
        return success({
          title: docData.title,
          tags: docData.tags || [],
        })
      }

      // For private docs, retrieve and decrypt with docKey
      const docKey = await gunService.readPrivateData(['docKeys', docId])
      if (!docKey) {
        return failure({ code: 'PERMISSION_DENIED', message: 'Access denied' })
      }

      const title = await encryptionService.decrypt(docData.title, docKey)
      const tags = docData.tags
        ? await Promise.all(docData.tags.map(tag => encryptionService.decrypt(tag, docKey)))
        : []

      return success({ title, tags })
    }),
    tryCatch(
      result => result,
      error => ({ code: 'ENCRYPTION_ERROR', message: 'Failed to decrypt metadata', details: error })
    )
  )
}
```

## Benefits

- **Security**: User-scoped storage eliminates global namespace vulnerabilities
- **Clean Architecture**: Clear separation between storage and business logic
- **Performance**: Two-phase loading enables scalable document browsing
- **Efficient Memory**: Lazy loading prevents unnecessary decryption
- **State Management**: Single status field eliminates race conditions
- **Features**: Built-in sharing with SEA ECDH from day one
- **Type Safety**: functionalResult provides compile-time error handling guarantees
- **Functional Programming**: Consistent error handling patterns across all operations
- **Clean UI**: Unwrapped state values simplify component integration
- **Phased Approach**: Manageable implementation with clear deliverables

## Phase 6: UI Integration Example

```typescript
// Component usage with efficient loading
const {
  listDocuments,
  getDocumentMetadata,
  getDocument,
  documentList,
  status
} = useDocumentStore()

// Load list on mount
useEffect(() => {
  if (status === 'READY') {
    listDocuments().then(result => {
      if (result.success) {
        // Optionally load metadata for first few items
        result.data.slice(0, 5).forEach(doc => {
          getDocumentMetadata(doc.docId).then(metaResult => {
            if (metaResult.success) {
              // Update documentList item with title/tags
              // This could be handled in the store
            }
          })
        })
      }
    })
  }
}, [])

// Load full document when selected
const handleDocumentSelect = async (docId: string) => {
  const result = await getDocument(docId)
  if (result.success) {
    setCurrentDocument(result.data)
  }
}

// Render with progressive loading
return (
  <div>
    {status === 'LOADING' && <div>Loading documents...</div>}
    {status === 'SAVING' && <div>Saving...</div>}

    {documentList.map(doc => (
      <DocumentItem
        key={doc.docId}
        docId={doc.docId}
        createdAt={doc.createdAt}
        updatedAt={doc.updatedAt}
        // title and tags loaded progressively via getDocumentMetadata
        onClick={() => handleDocumentSelect(doc.docId)}
      />
    ))}
  </div>
)
```

## Success Criteria

Each phase should be considered complete when:

- All tasks are implemented and tested
- Error handling follows functionalResult patterns
- TypeScript compilation passes without errors
- Code follows AGENTS.md security guidelines
- Phase-specific deliverables are functional

## Risk Mitigation

- **Complexity**: Phased approach prevents overwhelm
- **Security**: Following AGENTS.md guidelines prevents vulnerabilities
- **Performance**: Two-phase loading prevents scalability issues
- **Type Safety**: functionalResult ensures compile-time error handling
