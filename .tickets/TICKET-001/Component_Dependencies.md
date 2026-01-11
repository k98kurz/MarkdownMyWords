# Component Dependency Diagram

## Component Hierarchy

```
App (Root)
│
├── ThemeProvider
│   └── Provides theme context
│
├── AuthProvider
│   ├── Manages authentication state
│   └── Provides encryption keys
│
├── GunProvider
│   └── Provides GunDB client
│
└── MainLayout
    │
    ├── Header
    │   ├── Logo
    │   ├── UserMenu
    │   │   ├── Username
    │   │   ├── Settings
    │   │   └── Logout
    │   ├── ThemeToggle
    │   └── SettingsButton
    │
    ├── DocumentList (Left Sidebar)
    │   ├── DocumentItem[]
    │   │   ├── DocumentIcon
    │   │   ├── DocumentTitle
    │   │   ├── LastModified
    │   │   └── DocumentMenu
    │   │       ├── Rename
    │   │       ├── Delete
    │   │       └── Export
    │   └── NewDocumentButton
    │
    ├── EditorArea
    │   ├── EditorTabs
    │   │   ├── EditTab
    │   │   ├── PreviewTab
    │   │   └── SplitTab
    │   │
    │   ├── MarkdownEditor
    │   │   ├── EditorToolbar
    │   │   │   ├── BoldButton
    │   │   │   ├── ItalicButton
    │   │   │   ├── HeadingButton
    │   │   │   └── ...
    │   │   └── CodeMirrorEditor
    │   │       └── CodeMirror (external)
    │   │
    │   └── MarkdownPreview
    │       └── ReactMarkdown (external)
    │
    └── RightSidebar
        ├── AISidebar
        │   ├── ReviewButton
        │   ├── ReviseButton
        │   ├── SuggestButton
        │   ├── ReviewResults
        │   │   ├── SuggestionItem[]
        │   │   └── ApplyButton
        │   ├── CostDisplay
        │   └── UsageStats
        │
        ├── SharingSidebar
        │   ├── CollaboratorsList
        │   │   └── CollaboratorItem[]
        │   │       ├── Username
        │   │       ├── PermissionBadge
        │   │       └── RemoveButton
        │   ├── AddCollaboratorForm
        │   │   │   ├── UsernameInput
        │   │   ├── PermissionSelect
        │   │   └── AddButton
        │   ├── PublicSharingToggle
        │   ├── ShareTokenDisplay
        │   └── CopyLinkButton
        │
        └── BranchMergeUI (conditional)
            ├── PendingBranchesList
            │   └── BranchItem[]
            │       ├── BranchMetadata
            │       ├── DiffButton
            │       ├── MergeButton
            │       └── RejectButton
            ├── BranchDiffView
            │   ├── MainContent
            │   ├── BranchContent
            │   └── DiffHighlights
            └── MergeConfirmation
```

## Service Dependencies

```
Services Layer
│
├── gunService
│   ├── Depends on: GunDB client
│   └── Used by: DocumentList, EditorArea, SharingSidebar
│
├── encryptionService
│   ├── Depends on: Web Crypto API, user key
│   └── Used by: All components that handle documents
│
├── llmService
│   ├── Depends on: OpenRouter API, API key
│   └── Used by: AISidebar
│
├── branchService
│   ├── Depends on: gunService, encryptionService
│   └── Used by: BranchMergeUI, EditorArea
│
├── syncService
│   ├── Depends on: gunService
│   └── Used by: EditorArea, DocumentList
│
└── storageService
    ├── Depends on: IndexedDB API
    └── Used by: All services (caching)
```

## State Dependencies

```
Zustand Stores
│
├── authStore
│   ├── user: User | null
│   ├── isAuthenticated: boolean
│   ├── userKey: CryptoKey | null
│   └── login(), logout(), deriveKey()
│
├── documentStore
│   ├── documents: Document[]
│   ├── currentDocId: string | null
│   ├── currentContent: string
│   └── loadDocument(), updateDocument(), createDocument()
│
├── uiStore
│   ├── theme: 'light' | 'dark'
│   ├── sidebarVisible: boolean
│   ├── editorMode: 'edit' | 'preview' | 'split'
│   └── setTheme(), toggleSidebar(), setEditorMode()
│
└── sharingStore
    ├── collaborators: Collaborator[]
    ├── pendingBranches: Branch[]
    └── loadCollaborators(), loadBranches()
```

## Data Flow Dependencies

```
User Action
    │
    ▼
Component
    │
    ▼
Zustand Store (State)
    │
    ▼
Service Layer
    │
    ├──► gunService ──► GunDB
    ├──► encryptionService ──► Web Crypto API
    └──► llmService ──► OpenRouter API
            │
            ▼
        Update State
            │
            ▼
        Re-render Components
```

## External Dependencies

### npm Packages

```
dependencies:
  - react: ^18.0.0
  - react-dom: ^18.0.0
  - gun: ^0.2020.x
  - zustand: ^4.0.0
  - @codemirror/view: ^6.0.0
  - @codemirror/state: ^6.0.0
  - react-markdown: ^8.0.0
  - remark-gfm: ^3.0.0

devDependencies:
  - typescript: ^5.0.0
  - vite: ^4.0.0
  - @types/react: ^18.0.0
  - eslint: ^8.0.0
  - prettier: ^3.0.0
```

### Browser APIs

- Web Crypto API (encryption)
- IndexedDB (storage)
- WebSocket (GunDB sync)
- Fetch API (OpenRouter)

## Dependency Injection

### Providers

```typescript
// App.tsx
<ThemeProvider>
  <AuthProvider>
    <GunProvider>
      <MainLayout />
    </GunProvider>
  </AuthProvider>
</ThemeProvider>
```

### Service Initialization

```typescript
// Services initialized in providers
const gunService = useGunService();
const encryptionService = useEncryptionService();
const llmService = useLLMService();
```

## Circular Dependencies Prevention

### Structure

1. **Components** → **Stores** → **Services** → **External APIs**
2. No components depend directly on services
3. Services don't depend on components
4. Stores act as intermediaries

### Example

```
Component (DocumentList)
    │
    ▼
Store (documentStore)
    │
    ▼
Service (gunService)
    │
    ▼
External (GunDB)
```

## Module Boundaries

### Clear Separation

1. **UI Layer**: Components only
2. **State Layer**: Zustand stores
3. **Service Layer**: Business logic
4. **Data Layer**: GunDB, APIs

### Import Rules

- Components can import stores
- Stores can import services
- Services can import external APIs
- No reverse dependencies

## Testing Dependencies

### Unit Tests

- Components: React Testing Library
- Stores: Zustand testing utilities
- Services: Mock external APIs

### Integration Tests

- Component + Store + Service
- Mock GunDB
- Mock OpenRouter API

## Build Dependencies

### Development

- Vite (dev server)
- TypeScript (type checking)
- ESLint (linting)
- Prettier (formatting)

### Production

- Vite (bundling)
- TypeScript (compilation)
- Tree shaking
- Minification
