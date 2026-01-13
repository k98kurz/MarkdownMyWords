# Architecture Research & Design

## GunDB Architecture & Best Practices

### Core Concepts

1. **Graph Database Model**
   - GunDB uses a graph structure where data is stored as nodes with properties
   - Nodes can reference other nodes, creating a graph
   - Each node has a unique identifier (soul)
   - Data is stored as key-value pairs within nodes

2. **Peer-to-Peer Sync**
   - GunDB syncs data across peers automatically
   - Uses WebRTC for direct peer connections
   - Falls back to relay servers when direct connection fails
   - Data is replicated across all connected peers

3. **Data Structure Patterns**
   - Use nested objects for hierarchical data
   - Reference other nodes using their soul (ID)
   - Use arrays for lists (stored as objects with numeric keys)
   - Metadata can be stored alongside encrypted content

4. **Best Practices**
   - Keep node sizes reasonable (avoid very large nodes)
   - Use separate nodes for large content (like document bodies)
   - Store metadata separately from encrypted content for querying
   - Use timestamps for conflict resolution
   - Implement proper error handling for offline scenarios

### GunDB Data Model for MarkdownMyWords

#### User Node Structure
```
{appNamespace}~user~{userId}
  ├── profile
  │   ├── username (public)
  │   ├── encryptedProfile (encrypted user data)
  │   └── publicKey (for sharing)
  ├── documents (reference to documents collection)
  └── settings
      ├── theme
      └── editorSettings
```

> **Note**: All paths are namespaced with the app name (`markdownmywords` by default) to avoid collisions when multiple applications share the same GunDB relay server.

#### Document Node Structure
```
{appNamespace}~doc~{docId}
  ├── metadata
  │   ├── title (encrypted or public based on sharing)
  │   ├── createdAt (timestamp)
  │   ├── updatedAt (timestamp)
  │   ├── lastModifiedBy (userId for last-write-wins)
  │   └── tags (array)
  ├── encryptedContent (encrypted document body)
  ├── sharing
  │   ├── owner (userId)
  │   ├── isPublic (boolean)
  │   ├── readAccess (array of userIds)
  │   ├── writeAccess (array of userIds)
  │   └── shareToken (for public links)
  └── branches (only for shared documents)
      ├── main (current merged state)
      └── {appNamespace}~branch~{userId}~{timestamp}
          ├── encryptedContent
          ├── createdBy (userId)
          ├── createdAt (timestamp)
          └── status (pending|merged|rejected)
```

> **Note**: All paths are namespaced with the app name to avoid collisions.

#### Branch Node Structure (for shared documents)
```
{appNamespace}~branch~{userId}~{timestamp}
  ├── encryptedContent (proposed changes)
  ├── createdBy (userId)
  ├── createdAt (timestamp)
  ├── status (pending|merged|rejected)
  ├── mergedAt (timestamp, if merged)
  └── mergedBy (userId, if merged)
```

> **Note**: All paths are namespaced with the app name to avoid collisions.

### GunDB Operations

1. **Initialization**
   - Connect to relay server (Cloudflare Workers)
   - Configure storage (IndexedDB for browser)
   - Set up user authentication

2. **Reading Data**
   - Use `gun.get()` to read nodes
   - Subscribe to changes with `.on()` for real-time updates
   - Handle offline scenarios gracefully

3. **Writing Data**
   - Use `gun.get().put()` to write data
   - GunDB handles conflict resolution automatically (last-write-wins)
   - For branches, create new nodes and update status

4. **Sharing**
   - Grant access by adding userIds to readAccess/writeAccess
   - For branches, collaborators create branch nodes
   - Owner merges by copying branch content to main

### Relay Server (Cloudflare Workers)

- Simple HTTP/WebSocket server
- Helps with peer discovery
- Acts as fallback when direct P2P fails
- No data storage (just relay)
- Free tier: 100k requests/day

## Encryption Architecture

### GunDB SEA (Security, Encryption, Authorization)

1. **User Authentication**: SEA handles user creation and authentication
   - Automatic ECDSA key pair generation
   - Password-based authentication
   - Integrated with GunDB

2. **Document Encryption**: SEA symmetric encryption with document-specific keys
   - Documents encrypted using `SEA.encrypt()` with per-document symmetric keys
   - Documents decrypted using `SEA.decrypt()` with the same document key
   - Document keys are generated using Web Crypto API (AES-GCM 256-bit) and exported as base64 strings
   - Enables branching model (all branches use the same document key)

3. **Key Sharing**: SEA's ECDH for secure key exchange
   - Derives shared secret using `SEA.secret()` via ECDH (Elliptic Curve Diffie-Hellman)
   - Encrypts document keys with `SEA.encrypt()` using the shared secret
   - Each collaborator receives the encrypted document key along with the sender's ephemeral public key
   - Recipient derives the same shared secret using their ephemeral key pair and the sender's ephemeral public key

### Key Management

- **User Keys**: Derived on login, stored in memory only
- **Document Keys**: Generated per document, encrypted with user.epriv and shared secrets (via ECDH) and stored in GunDB
- **Ephemeral Keys**: Generated once per user, stored in GunDB (public key publicly accessible, private key in user's encrypted storage)
- **Never**: Store plaintext keys or passwords

## Sharing & Permissions Model

### Permission Levels

1. **Owner**: Full control, can merge branches
2. **Write Access**: Can create branches, edit (for single-user docs)
3. **Read Access**: Can view document, create branches
4. **Public**: Anyone with link can view

### Branching Workflow (Shared Documents)

1. **Collaborator edits document**:
   - Creates a branch node: `branch~{userId}~{timestamp}`
   - Encrypts proposed changes
   - Sets status to "pending"

2. **Owner reviews branches**:
   - Views all pending branches
   - Can see diff between main and branch
   - Decides to merge or reject

3. **Owner merges branch**:
   - Copies branch content to main
   - Updates branch status to "merged"
   - Updates document metadata (updatedAt, etc.)

4. **Single-user multi-device**:
   - Uses last-write-wins
   - No branches needed
   - Timestamp-based conflict resolution

## OpenRouter API Integration

### Client-Side Integration

1. **API Key**: User provides their own key
2. **Endpoints**: Use OpenRouter REST API
3. **Models**: Support multiple LLM providers
4. **Costs**: User responsible for their own usage

### Features

- **Review**: Analyze document for improvements
- **Revise**: Suggest edits and improvements
- **Suggest**: Generate content suggestions

### Implementation

- Use fetch API for HTTP requests
- Handle rate limiting
- Cache responses when appropriate
- Show cost estimates to user

## UI/UX Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo, User Menu, Theme Toggle                 │
├──────────────┬──────────────────────────┬───────────────┤
│              │                          │               │
│  Document    │   Main Editor/Preview    │   Sidebar     │
│  List        │   (Split or Single View) │   (Right)     │
│  (Left)      │                          │               │
│              │                          │  - AI Panel   │
│              │                          │  - Sharing    │
│              │                          │  - Branches   │
│              │                          │    (if shared)│
│              │                          │               │
└──────────────┴──────────────────────────┴───────────────┘
```

### Component Hierarchy

```
App
├── Header
│   ├── Logo
│   ├── UserMenu
│   └── ThemeToggle
├── MainLayout
│   ├── DocumentList (left sidebar)
│   ├── EditorArea
│   │   ├── EditorTabs
│   │   ├── MarkdownEditor
│   │   └── MarkdownPreview
│   └── RightSidebar
│       ├── AISidebar
│       ├── SharingSidebar
│       └── BranchMergeUI (conditional)
└── AuthModal
```

### Branch Merge UI

- List of pending branches
- Diff view (before/after)
- Merge button
- Reject button
- Branch metadata (author, timestamp)

## Technology Choices

### Frontend Framework: React
- **Rationale**: Industry standard, large ecosystem, component-based
- **Version**: 18.0.0+

### State Management: Zustand (recommended)
- **Rationale**: Simpler than Redux, smaller bundle, good TypeScript support
- **Alternative**: Jotai (if atomic state needed)

### Editor: CodeMirror 6 (recommended)
- **Rationale**: Lighter than Monaco, better markdown support, more customizable
- **Alternative**: Monaco Editor (if VS Code features needed)

### Encryption: GunDB SEA
- **Rationale**: Integrated with GunDB, provides ECDH key exchange, symmetric encryption via `SEA.encrypt()`/`SEA.decrypt()`
- **Key Generation**: Web Crypto API for generating document keys (AES-GCM 256-bit), then exported as base64 for use with SEA

### Markdown Rendering: react-markdown
- **Rationale**: Popular, secure (no XSS), extensible

## Performance Considerations

1. **Large Documents**:
   - SEA handles encryption efficiently
   - Lazy load document content

2. **Many Documents**:
   - Paginate document list
   - Virtual scrolling for long lists
   - Index documents in IndexedDB

3. **Network**:
   - Optimistic updates
   - Queue writes when offline
   - Batch operations when possible

4. **Storage**:
   - Compress encrypted content
   - Clean up old branches
   - Export functionality for backup

## Security Considerations

1. **Encryption**:
   - Never store plaintext keys
   - Use SEA's built-in encryption (`SEA.encrypt()`/`SEA.decrypt()`)
   - Use ECDH via `SEA.secret()` for secure key sharing
   - Document keys generated with Web Crypto API (AES-GCM 256-bit)

2. **Authentication**:
   - Keys derived from password never leave client
   - Use GunDB SEA for peer authentication
   - Validate all inputs

3. **Sharing**:
   - Encrypt shared document keys
   - Validate permissions before operations
   - Use secure share tokens

4. **XSS Prevention**:
   - Sanitize all user input
   - Use react-markdown (safe by default)
   - Content Security Policy headers

## Deployment Strategy

### Cloudflare Pages
- Static site hosting
- Automatic deployments from Git
- Free tier sufficient for MVP

### Cloudflare Workers (Relay)
- Simple WebSocket relay
- No state storage
- Free tier: 100k requests/day

### Build Process
- Vite for bundling
- TypeScript for type safety
- Environment variables for config
