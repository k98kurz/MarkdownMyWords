# MarkdownMyWords - Comprehensive Architecture Document

## Executive Summary

MarkdownMyWords is a decentralized, peer-to-peer markdown editor with offline-first capabilities, real-time collaboration, and AI-powered features. The application uses GunDB for decentralized storage, end-to-end encryption for privacy, and Cloudflare infrastructure for hosting.

## System Overview

### Architecture Principles

1. **Decentralization**: No central server, users host their own data
2. **Privacy**: End-to-end encryption, keys never leave client
3. **Offline-First**: Works offline, syncs when online
4. **Collaboration**: Peer-to-peer sharing with conflict resolution
5. **Free**: Uses free tiers of Cloudflare services

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Pages (Static Hosting)               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              React Application (SPA)                   │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │   Editor     │  │   GunDB      │  │   OpenRouter│ │  │
│  │  │  Component   │  │   Client     │  │   Client    │ │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │  │
│  │         │                  │                  │          │  │
│  │         └──────────────────┼──────────────────┘          │  │
│  │                            │                              │  │
│  │                  ┌─────────▼─────────┐                   │  │
│  │                  │  State Management  │                   │  │
│  │                  │  (Zustand)        │                   │  │
│  │                  └────────────────────┘                   │  │
│  │                            │                              │  │
│  │                  ┌─────────▼─────────┐                   │  │
│  │                  │  Encryption Layer │                   │  │
│  │                  │  (GunDB SEA)      │                   │  │
│  │                  └────────────────────┘                   │  │
│  │                            │                              │  │
│  │                  ┌─────────▼─────────┐                   │  │
│  │                  │  Browser Storage   │                   │  │
│  │                  │  (IndexedDB)       │                   │  │
│  │                  └────────────────────┘                   │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
    │ Peer 1 │         │ Peer 2  │         │ Relay   │
    │ (User)  │◄───────►│ (User)  │◄───────►│ Worker  │
    └─────────┘         └─────────┘         └─────────┘
```

## Component Architecture

### Frontend Components

#### Core Components

1. **App**
   - Root component
   - Manages routing and global state
   - Handles authentication flow

2. **Header**
   - Logo and branding
   - User menu (settings, logout)
   - Theme toggle
   - Settings button

3. **MainLayout**
   - Three-column layout
   - Responsive design
   - Manages sidebar visibility

#### Document Management

4. **DocumentList**
   - Lists user's documents
   - Search and filter
   - Create new document
   - Delete/rename documents

5. **DocumentItem**
   - Individual document in list
   - Shows title, last modified
   - Context menu

#### Editor Components

6. **EditorArea**
   - Container for editor/preview
   - Manages view mode (edit/preview/split)

7. **MarkdownEditor**
   - CodeMirror-based editor
   - Syntax highlighting
   - Toolbar for formatting
   - Auto-save

8. **MarkdownPreview**
   - Renders markdown to HTML
   - Syntax highlighting for code
   - Scroll sync (in split view)

#### Sidebar Components

9. **AISidebar**
   - AI features (review, revise, suggest)
   - Cost tracking
   - Usage statistics

10. **SharingSidebar**
    - Manage collaborators
    - Public sharing
    - Permission management

11. **BranchMergeUI**
    - List pending branches
    - Diff view
    - Merge/reject actions

#### Authentication

12. **AuthModal**
    - Login form
    - Registration form
    - Password reset (future)

### Services Layer

1. **gunService**
   - GunDB client initialization
   - Document CRUD operations
   - User management
   - Sharing operations

2. **encryptionService**
   - PBKDF2 key derivation
   - Document encryption/decryption
   - Key management
   - Shared document key handling

3. **llmService**
   - OpenRouter API integration
   - Review document
   - Revise document
   - Suggest content

4. **branchService**
   - Create branches
   - List branches
   - Merge branches
   - Reject branches

5. **syncService**
   - Conflict resolution
   - Last-write-wins (single-user)
   - Branch management (shared)

6. **storageService**
   - IndexedDB abstraction
   - Local caching
   - Offline queue

## Data Flow

### Document Creation Flow

```
User clicks "New Document"
  ↓
Generate unique docId
  ↓
Create document node in GunDB
  ↓
Encrypt content with user key
  ↓
Store encrypted content
  ↓
Add reference to user's document list
  ↓
Open document in editor
```

### Document Edit Flow (Single User)

```
User edits document
  ↓
Debounce changes (500ms)
  ↓
Encrypt new content
  ↓
Update document node in GunDB
  ↓
Update metadata (updatedAt, lastModifiedBy)
  ↓
GunDB syncs to other devices
  ↓
Last-write-wins conflict resolution
```

### Document Edit Flow (Shared Document)

```
Collaborator edits shared document
  ↓
Create branch node
  ↓
Encrypt proposed changes
  ↓
Set branch status to "pending"
  ↓
Notify document owner
  ↓
Owner reviews branch
  ↓
Owner merges or rejects
  ↓
If merged: update main document
```

### Sharing Flow

```
Owner shares document
  ↓
Generate document-specific key (if first share)
  ↓
Encrypt document with document key
  ↓
For each collaborator:
  - Get collaborator's public key
  - Encrypt document key with public key
  - Store encrypted key
  - Add to access list
  ↓
Create document reference for collaborator
  ↓
Notify collaborator (optional)
```

## Security Architecture

### Authentication

1. **User Registration**
   - Generate random salt
   - Store salt in GunDB (can be public)
   - Create user profile

2. **User Login**
   - Retrieve salt from GunDB
   - Derive key from username + password
   - Store key in memory (never persisted)
   - Authenticate with GunDB

3. **Session Management**
   - Key stored in memory only
   - Session persists until logout or page close
   - No server-side session

### Encryption

1. **Key Derivation**
   - GunDB SEA (automatic key management)
   - SHA-256 hash
   - 256-bit key output
   - Per-user salt

2. **Document Encryption**
   - AES-256-GCM
   - Random IV per encryption
   - Authentication tag included
   - Encrypted content stored in GunDB

3. **Shared Document Encryption**
   - Document-specific key
   - Key encrypted with each collaborator's public key
   - RSA-OAEP for key encryption

### Access Control

1. **Permission Checks**
   - Verify ownership before operations
   - Check access lists before read/write
   - Validate share tokens for public access

2. **Branch Security**
   - Only owner can merge branches
   - Branch content encrypted with document key
   - Branch status changes logged

## Deployment Architecture

### Cloudflare Pages

- **Purpose**: Static site hosting
- **Deployment**: Git-based (automatic)
- **Build**: Vite production build
- **CDN**: Global edge network
- **Cost**: Free tier sufficient

### Cloudflare Workers (Relay)

- **Purpose**: GunDB relay server
- **Protocol**: WebSocket
- **Function**: Peer discovery and relay
- **Storage**: None (stateless)
- **Cost**: Free tier (100k requests/day)

### Build Process

```
Git Push
  ↓
Cloudflare Pages Build
  ↓
npm install
  ↓
npm run build
  ↓
Deploy to CDN
```

## Performance Considerations

### Optimization Strategies

1. **Code Splitting**
   - Lazy load components
   - Route-based splitting
   - Dynamic imports

2. **Caching**
   - Service worker (future)
   - IndexedDB caching
   - GunDB local storage

3. **Large Documents**
   - Chunk encryption
   - Web Workers for encryption
   - Virtual scrolling for long documents

4. **Network**
   - Optimistic updates
   - Offline queue
   - Batch operations

## Scalability Considerations

### Current Limitations

- Browser storage limits (IndexedDB quotas)
- GunDB peer connections
- OpenRouter API rate limits

### Mitigation Strategies

1. **Storage**
   - Export functionality
   - Data cleanup (old branches)
   - Compression

2. **Network**
   - Relay server for connectivity
   - Offline-first design
   - Incremental sync

3. **API**
   - Rate limiting
   - Cost warnings
   - Caching

## Technology Stack Summary

- **Frontend**: React 18 + TypeScript
- **State**: Zustand
- **Editor**: CodeMirror 6
- **Rendering**: react-markdown
- **Database**: GunDB
- **Encryption**: Web Crypto API
- **Build**: Vite
- **Hosting**: Cloudflare Pages
- **Relay**: Cloudflare Workers
- **LLM**: OpenRouter API

## Related Documents

- `Architecture_Research.md`: Detailed research and patterns
- `Data_Model.md`: Complete data schema
- `Encryption_Architecture.md`: Encryption details
- `Sharing_Permissions_Model.md`: Sharing and permissions
- `OpenRouter_Integration.md`: LLM integration
- `UI_UX_Design.md`: User interface design
- `Technology_Choices.md`: Technology decisions
- `Implementation_Plan.md`: Implementation breakdown
