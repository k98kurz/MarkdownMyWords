# UI/UX Design

## Layout Structure

### Main Application Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Header                                                         │
│  [Logo] MarkdownMyWords    [User Menu ▼]  [🌙 Theme]  [⚙️]  │
├──────────────┬──────────────────────────────────┬───────────────┤
│              │                                  │               │
│  Document    │                                  │   Right       │
│  List        │      Main Editor/Preview          │   Sidebar     │
│  (Left)      │      Area                         │               │
│              │                                  │  - AI Panel   │
│  [📄] Doc 1  │  ┌────────────────────────────┐  │  - Sharing    │
│  [📄] Doc 2  │  │  Editor Tabs              │  │  - Branches   │
│  [📄] Doc 3  │  │  [Edit] [Preview] [Both]  │  │    (if shared)│
│              │  ├────────────────────────────┤  │               │
│  [+ New]     │  │                            │  │               │
│              │  │  Markdown Editor           │  │               │
│              │  │  (Syntax Highlighted)      │  │               │
│              │  │                            │  │               │
│              │  │  # Document Title         │  │               │
│              │  │                            │  │               │
│              │  │  Content here...          │  │               │
│              │  │                            │  │               │
│              │  └────────────────────────────┘  │               │
│              │                                  │               │
└──────────────┴──────────────────────────────────┴───────────────┘
```

## Component Hierarchy

```
App
├── Header
│   ├── Logo
│   ├── UserMenu
│   │   ├── Username
│   │   ├── Settings
│   │   └── Logout
│   ├── ThemeToggle
│   └── SettingsButton
├── MainLayout
│   ├── DocumentList (Left Sidebar)
│   │   ├── DocumentItem[]
│   │   │   ├── Icon
│   │   │   ├── Title
│   │   │   ├── LastModified
│   │   │   └── Menu (⋮)
│   │   └── NewDocumentButton
│   ├── EditorArea
│   │   ├── EditorTabs
│   │   │   ├── EditTab
│   │   │   ├── PreviewTab
│   │   │   └── SplitTab
│   │   ├── MarkdownEditor
│   │   │   ├── Toolbar
│   │   │   │   ├── Bold
│   │   │   │   ├── Italic
│   │   │   │   ├── Heading
│   │   │   │   └── ...
│   │   │   └── CodeEditor (CodeMirror)
│   │   └── MarkdownPreview
│   │       └── RenderedContent
│   └── RightSidebar
│       ├── AISidebar
│       │   ├── ReviewButton
│       │   ├── ReviseButton
│       │   ├── SuggestButton
│       │   ├── ReviewResults
│       │   └── CostDisplay
│       ├── SharingSidebar
│       │   ├── CollaboratorsList
│       │   ├── AddCollaboratorForm
│       │   ├── PublicSharingToggle
│       │   └── ShareTokenDisplay
│       └── BranchMergeUI (conditional)
│           ├── PendingBranchesList
│           ├── BranchDiffView
│           ├── MergeButton
│           └── RejectButton
└── AuthModal
    ├── LoginForm
    └── RegisterForm
```

## Component Specifications

### DocumentList Component

**Purpose**: Display user's documents and allow navigation

**Props**:
```typescript
interface DocumentListProps {
  documents: Document[];
  currentDocId?: string;
  onSelectDocument: (docId: string) => void;
  onNewDocument: () => void;
  onDeleteDocument: (docId: string) => void;
}
```

**Features**:
- List of documents with title and last modified date
- Active document highlighted
- Search/filter documents
- Sort by: name, date modified, date created
- Context menu: rename, delete, duplicate, export

**Design**:
- Collapsible sidebar (can be hidden on mobile)
- Scrollable list
- Empty state: "No documents yet. Create one!"
- Loading state: Skeleton loaders

### MarkdownEditor Component

**Purpose**: Syntax-highlighted markdown editor

**Props**:
```typescript
interface MarkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  theme: 'light' | 'dark';
}
```

**Features**:
- Syntax highlighting for markdown
- Line numbers
- Word wrap toggle
- Font size adjustment
- Auto-save indicator
- Character/word count
- Find & replace

**Editor Choice**: CodeMirror 6
- Lighter than Monaco
- Better markdown support
- More customizable
- Good TypeScript support

### MarkdownPreview Component

**Purpose**: Render markdown as HTML

**Props**:
```typescript
interface MarkdownPreviewProps {
  content: string;
  theme: 'light' | 'dark';
}
```

**Features**:
- Rendered markdown with styling
- Code syntax highlighting
- Math rendering (optional)
- Table of contents (for long documents)
- Scroll sync with editor (in split view)

**Library**: react-markdown with remark plugins

### AISidebar Component

**Purpose**: AI-powered document assistance

**Props**:
```typescript
interface AISidebarProps {
  documentContent: string;
  apiKey: string;
  onApplySuggestion: (content: string) => void;
  onCostUpdate: (cost: number) => void;
}
```

**Features**:
- Review document button
- Revise document (with instructions)
- Suggest content
- Display review results
- Show estimated costs
- Usage statistics

**Sections**:
1. **Review**: Analyze document for improvements
2. **Revise**: Apply AI-suggested revisions
3. **Suggest**: Generate content suggestions
4. **Stats**: Usage and cost tracking

### SharingSidebar Component

**Purpose**: Manage document sharing and permissions

**Props**:
```typescript
interface SharingSidebarProps {
  docId: string;
  isOwner: boolean;
  collaborators: Collaborator[];
  onAddCollaborator: (userId: string, accessLevel: 'read' | 'write') => void;
  onRemoveCollaborator: (userId: string) => void;
  onTogglePublic: (isPublic: boolean) => void;
  shareToken?: string;
}
```

**Features**:
- List of collaborators with permissions
- Add collaborator (by username or email)
- Remove collaborator
- Change permission level
- Public sharing toggle
- Share token generation and display
- Copy link button

### BranchMergeUI Component

**Purpose**: Review and merge branches for shared documents

**Props**:
```typescript
interface BranchMergeUIProps {
  docId: string;
  branches: Branch[];
  mainContent: string;
  onMerge: (branchId: string) => void;
  onReject: (branchId: string, reason?: string) => void;
  isOwner: boolean;
}
```

**Features**:
- List of pending branches
- Branch metadata (author, timestamp, description)
- Diff view (main vs branch)
- Side-by-side comparison
- Merge button (owner only)
- Reject button (owner only)
- Branch history

**Diff View**:
- Highlight additions (green)
- Highlight deletions (red)
- Line-by-line comparison
- Inline diff or side-by-side

## Theme System

### Color Palette

**Light Theme**:
```css
:root[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --bg-tertiary: #e0e0e0;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --border: #d0d0d0;
  --accent: #0066cc;
  --accent-hover: #0052a3;
  --success: #28a745;
  --warning: #ffc107;
  --error: #dc3545;
}
```

**Dark Theme**:
```css
:root[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-tertiary: #404040;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --border: #505050;
  --accent: #4da6ff;
  --accent-hover: #66b3ff;
  --success: #48d597;
  --warning: #ffd54f;
  --error: #ff6b6b;
}
```

### Theme Implementation

```typescript
// ThemeProvider
const ThemeContext = createContext<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}>();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
    // Persist to GunDB
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

## Responsive Design

### Breakpoints

- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### Mobile Layout

```
┌─────────────────────────┐
│  Header                 │
├─────────────────────────┤
│  [☰] Menu              │
├─────────────────────────┤
│                         │
│  Editor/Preview         │
│  (Full width)           │
│                         │
├─────────────────────────┤
│  [AI] [Share] [Branches]│
│  (Bottom tabs)          │
└─────────────────────────┘
```

**Mobile Features**:
- Collapsible sidebars
- Bottom navigation for AI/Sharing
- Full-screen editor
- Swipe gestures for navigation

## User Interactions

### Document Operations

1. **Create Document**:
   - Click "+ New" button
   - Modal: Enter title (optional)
   - Creates document and opens editor

2. **Edit Document**:
   - Click document in list
   - Opens in editor
   - Auto-saves on change

3. **Delete Document**:
   - Right-click or menu (⋮)
   - Confirmation dialog
   - Moves to trash (optional) or deletes immediately

4. **Share Document**:
   - Open sharing sidebar
   - Add collaborator or generate public link
   - Set permissions

### Editor Operations

1. **Switch Views**:
   - Tabs: Edit | Preview | Both
   - Split view shows editor and preview side-by-side

2. **Format Text**:
   - Toolbar buttons for common formatting
   - Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)
   - Markdown syntax support

3. **Save**:
   - Auto-save on change (debounced)
   - Manual save button (optional)
   - Save indicator: "Saved" | "Saving..." | "Unsaved changes"

### Branch Operations (Shared Documents)

1. **Create Branch**:
   - Make edits to shared document
   - System automatically creates branch
   - Add optional description

2. **Review Branch**:
   - Owner sees notification
   - Opens branch merge UI
   - Views diff

3. **Merge Branch**:
   - Owner reviews diff
   - Clicks "Merge" button
   - Confirmation dialog
   - Branch merged into main

4. **Reject Branch**:
   - Owner clicks "Reject"
   - Optional reason
   - Branch status updated

## Accessibility

### Keyboard Navigation

- **Tab**: Navigate between interactive elements
- **Ctrl/Cmd + N**: New document
- **Ctrl/Cmd + S**: Save (if manual save enabled)
- **Ctrl/Cmd + F**: Find in editor
- **Ctrl/Cmd + B**: Bold
- **Ctrl/Cmd + I**: Italic
- **Escape**: Close modals/sidebars

### Screen Reader Support

- Semantic HTML elements
- ARIA labels for icons and buttons
- Live regions for status updates
- Proper heading hierarchy

### Visual Accessibility

- High contrast mode support
- Font size adjustment
- Focus indicators
- Color-blind friendly palette

## Wireframes

### Main Interface (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] MarkdownMyWords          [User ▼] [🌙] [⚙️]        │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│ Documents│  [Edit] [Preview] [Both]     │  AI Assistant     │
│          │  ────────────────────────    │  ─────────────    │
│ 📄 Doc 1 │                              │  [Review]         │
│ 📄 Doc 2 │  # My Document               │  [Revise]         │
│ 📄 Doc 3 │                              │  [Suggest]        │
│          │  This is the content...      │                   │
│ [+ New]  │                              │  Sharing          │
│          │                              │  ─────────────    │
│          │                              │  Collaborators:   │
│          │                              │  • user1 (write)  │
│          │                              │  • user2 (read)  │
│          │                              │  [+ Add]          │
│          │                              │                   │
└──────────┴──────────────────────────────┴───────────────────┘
```

### Branch Merge UI

```
┌─────────────────────────────────────────────────────────────┐
│  Pending Branches                                            │
├─────────────────────────────────────────────────────────────┤
│  Branch from user1 (2 hours ago)                            │
│  Description: "Fixed typos and improved clarity"            │
│  ┌─────────────────────┬─────────────────────┐             │
│  │ Main (Current)      │ Branch (Proposed)   │             │
│  ├─────────────────────┼─────────────────────┤             │
│  │ # Document          │ # Document          │             │
│  │                     │                     │             │
│  │ Some text here      │ Some text here      │             │
│  │ with errors         │ with fixes          │             │
│  │                     │                     │             │
│  └─────────────────────┴─────────────────────┘             │
│  [Merge] [Reject]                                           │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Checklist

- [ ] Layout components (Header, MainLayout, Sidebars)
- [ ] DocumentList component
- [ ] MarkdownEditor component (CodeMirror integration)
- [ ] MarkdownPreview component (react-markdown)
- [ ] AISidebar component
- [ ] SharingSidebar component
- [ ] BranchMergeUI component
- [ ] Theme system (light/dark)
- [ ] Responsive design (mobile/tablet/desktop)
- [ ] Keyboard shortcuts
- [ ] Accessibility features
- [ ] Loading states
- [ ] Error states
- [ ] Empty states
