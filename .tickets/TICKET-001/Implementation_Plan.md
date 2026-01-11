# Implementation Plan

## Overview

This ticket will produce a comprehensive architecture document and break down the MarkdownMyWords application into discrete, implementable tickets. The architecture will be based on a decentralized, peer-to-peer model using GunDB, React, and Cloudflare infrastructure.

## Architecture

### System Architecture

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
│  │                  │  (Web Crypto API)  │                   │  │
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

### Component Architecture

1. **Frontend Components**
   - `Editor`: Syntax-highlighted Markdown editor (CodeMirror 6)
   - `Preview`: Rendered markdown preview
   - `DocumentList`: List of user's documents
   - `AISidebar`: AI features panel (review, revise, suggest)
   - `SharingSidebar`: Document sharing and permissions
   - `BranchMergeUI`: Branch review and merge interface (for shared documents)
   - `ThemeProvider`: Dark/light mode management
   - `AuthProvider`: Authentication and encryption key management

2. **Services Layer**
   - `gunService`: GunDB client initialization and operations
   - `encryptionService`: PBKDF2 key derivation and document encryption/decryption
   - `llmService`: OpenRouter API integration
   - `exportService`: Document export to various formats
   - `storageService`: Browser storage abstraction
   - `branchService`: Branch creation, management, and merge operations (for shared documents)
   - `syncService`: Conflict resolution (last-write-wins for single-user, branch management for shared)

3. **State Management**
   - Global state: User authentication, current document, theme
   - Document state: Current document content, metadata
   - UI state: Sidebar visibility, editor mode, etc.

### Data Model

#### GunDB Graph Structure

```
user
  ├── profile
  │   ├── username
  │   ├── encryptedProfile
  │   └── publicKey
  ├── documents
  │   ├── doc-{id}
  │   │   ├── encryptedContent
  │   │   ├── metadata
  │   │   │   ├── title
  │   │   │   ├── createdAt
  │   │   │   ├── updatedAt
  │   │   │   ├── lastModifiedBy (for last-write-wins)
  │   │   │   └── tags
  │   │   ├── sharing
  │   │   │   ├── isPublic
  │   │   │   ├── owner (user ID)
  │   │   │   ├── readAccess
  │   │   │   ├── writeAccess
  │   │   │   └── shareToken
  │   │   └── branches (for shared documents only)
  │   │       ├── branch-{userId}-{timestamp}
  │   │       │   ├── encryptedContent
  │   │       │   ├── createdBy
  │   │       │   ├── createdAt
  │   │       │   └── status (pending, merged, rejected)
  │   │       └── main (current merged state)
  └── settings
      ├── theme
      ├── editorSettings
      └── openRouterApiKey (encrypted)
```

#### Encryption Model

- **Primary**: GunDB SEA for all standard encryption
  - User authentication with SEA
  - Automatic document encryption/decryption
  - ECDH-based sharing
- **Fallback**: Manual AES-256-GCM only for document-specific keys (branching model)
- **Metadata**: Some metadata (title, dates) may be unencrypted for search/indexing
- **Sharing**: Document-specific keys encrypted with SEA's ECDH for each collaborator

### Security Architecture

1. **Authentication Flow**
   - User enters username + password
   - Create/authenticate with GunDB SEA
   - SEA automatically handles key pair generation and management
   - SEA user object stored in state

2. **Data Encryption**
   - Standard documents: Encrypted automatically by SEA
   - Shared documents: Document-specific keys encrypted with SEA's ECDH for each collaborator
   - Encryption keys never leave client
   - SEA handles all key management

3. **Sharing Security**
   - Share tokens for public links
   - Access control lists for specific users
   - Read-only vs read-write permissions

### UI/UX Design

#### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo, User Menu, Theme Toggle                  │
├──────────────┬──────────────────────────┬───────────────┤
│              │                          │               │
│  Document    │   Main Editor/Preview    │   Sidebar     │
│  List        │   (Split or Single View) │   (Right)     │
│  (Left)      │                          │               │
│              │                          │  - AI Panel   │
│              │                          │  - Sharing    │
│              │                          │               │
└──────────────┴──────────────────────────┴───────────────┘
```

#### Theme System

- CSS variables for colors
- System preference detection
- Manual toggle
- Persist preference in GunDB

## Dependencies

### External Dependencies

- **React**: ^18.0.0
- **GunDB**: ^0.2020.x
- **CodeMirror 6**: For syntax highlighting (finalized decision)
- **react-markdown**: For markdown rendering
- **Zustand**: State management (finalized decision)
- **Web Crypto API**: Encryption (native browser API, finalized decision)
- **OpenRouter API**: LLM API client (user-provided keys)

### Infrastructure Dependencies

- Cloudflare Pages account
- Cloudflare Workers account (for relay)
- OpenRouter API (user-provided keys)

### Internal Dependencies

All tickets have been created (TICKET-002 through TICKET-012). Dependency graph:

```
TICKET-002 (Project Setup)
  ├── TICKET-003 (GunDB Integration) ──┐
  ├── TICKET-006 (Markdown Editor) ───┤
  ├── TICKET-010 (Theme System) ──────┤
  └── TICKET-011 (Workers Relay) ─────┤
                                       │
TICKET-003 (GunDB Integration)        │
  ├── TICKET-004 (Encryption System) ─┤
  └── TICKET-005 (Authentication) ────┤
                                       │
TICKET-004 (Encryption System)        │
  ├── TICKET-005 (Authentication) ────┤
  └── TICKET-008 (Sharing) ───────────┤
                                       │
TICKET-005 (Authentication)            │
  ├── TICKET-007 (Document Management)┤
  └── TICKET-009 (LLM Integration) ───┤
                                       │
TICKET-006 (Markdown Editor)          │
  └── TICKET-007 (Document Management)┤
                                       │
TICKET-007 (Document Management)      │
  └── TICKET-008 (Sharing) ───────────┤
                                       │
TICKET-011 (Workers Relay)             │
  └── TICKET-012 (Pages Deployment) ────┘
```

**Implementation Order** (respecting dependencies):

1. **TICKET-002**: Project Setup (foundation)
2. **TICKET-010**: Theme System (can be done early, depends only on TICKET-002)
3. **TICKET-003**: GunDB Integration (core infrastructure)
4. **TICKET-011**: Cloudflare Workers Relay (infrastructure, can be done in parallel)
5. **TICKET-004**: Encryption System (requires GunDB)
6. **TICKET-005**: Authentication System (requires GunDB + Encryption)
7. **TICKET-006**: Markdown Editor Component (requires TICKET-002)
8. **TICKET-009**: OpenRouter LLM Integration (requires TICKET-002 + TICKET-005)
9. **TICKET-007**: Document Management (requires TICKET-003, TICKET-004, TICKET-005, TICKET-006)
10. **TICKET-008**: Sharing & Permissions (requires TICKET-003, TICKET-004, TICKET-007)
11. **TICKET-012**: Cloudflare Pages Deployment (requires TICKET-002 + TICKET-011)

## Risks

### Technical Risks

1. **GunDB Learning Curve**
   - Risk: Team unfamiliarity with graph database concepts
   - Mitigation: Create proof-of-concept early, document patterns

2. **P2P Connectivity**
   - Risk: Users behind NATs may not connect
   - Mitigation: Relay server as fallback, clear error messages

3. **Browser Storage Limits**
   - Risk: IndexedDB quotas may be exceeded
   - Mitigation: Implement data cleanup, compression, export functionality

4. **Encryption Performance**
   - Risk: Large documents may be slow to encrypt/decrypt
   - Mitigation: Chunk large documents, use Web Workers for encryption

5. **OpenRouter API Costs**
   - Risk: Users may incur unexpected costs
   - Mitigation: Clear cost warnings, usage limits, caching

### Architectural Risks

1. **Data Loss**
   - Risk: Browser storage cleared, no backup
   - Mitigation: Export functionality, multiple peer sync, relay caching

2. **Conflict Resolution**
   - Risk: Concurrent edits from multiple devices or collaborators
   - Mitigation:
     - Single-user multi-device: Last-write-wins with timestamps (automatic)
     - Shared documents: Git branching model with manual merge UI (owner-controlled)

3. **Scalability**
   - Risk: Large number of documents may slow UI
   - Mitigation: Pagination, virtual scrolling, lazy loading

## Timeline

- **Phase 1 (Research & Design)**: 2-3 hours
- **Phase 2 (Documentation)**: 2-3 hours
- **Phase 3 (Ticket Creation)**: 1-2 hours
- **Phase 4 (Review & Validation)**: 1 hour

**Total Estimate**: 6-9 hours

## Success Criteria

- [ ] Architecture document is comprehensive and clear
- [ ] All major components are identified and documented
- [ ] Security model is well-defined
- [ ] Data model is designed and documented
- [ ] UI/UX is planned with wireframes or descriptions
- [ ] Implementation is broken into 10-15 discrete tickets
- [ ] Dependencies between tickets are clear
- [ ] Risks are identified with mitigation strategies
- [ ] Team can begin implementation immediately after this ticket
