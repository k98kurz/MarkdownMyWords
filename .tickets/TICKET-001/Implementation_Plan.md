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
│  │                  │  (Zustand/Jotai)  │                   │  │
│  │                  └────────────────────┘                   │  │
│  │                            │                              │  │
│  │                  ┌─────────▼─────────┐                   │  │
│  │                  │  Encryption Layer │                   │  │
│  │                  │  (PBKDF2 + AES)   │                   │  │
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
   - `Editor`: Syntax-highlighted Markdown editor (Monaco or CodeMirror)
   - `Preview`: Rendered markdown preview
   - `DocumentList`: List of user's documents
   - `AISidebar`: AI features panel (review, revise, suggest)
   - `SharingSidebar`: Document sharing and permissions
   - `ThemeProvider`: Dark/light mode management
   - `AuthProvider`: Authentication and encryption key management

2. **Services Layer**
   - `gunService`: GunDB client initialization and operations
   - `encryptionService`: PBKDF2 key derivation and document encryption/decryption
   - `llmService`: OpenRouter API integration
   - `exportService`: Document export to various formats
   - `storageService`: Browser storage abstraction

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
  │   │   │   └── tags
  │   │   └── sharing
  │   │       ├── isPublic
  │   │       ├── readAccess
  │   │       ├── writeAccess
  │   │       └── shareToken
  └── settings
      ├── theme
      ├── editorSettings
      └── openRouterApiKey (encrypted)
```

#### Encryption Model

- **Key Derivation**: PBKDF2(username + password, salt, iterations)
- **Document Encryption**: AES-GCM with derived key
- **Metadata**: Some metadata (title, dates) may be unencrypted for search/indexing
- **Sharing**: Shared documents use separate encryption keys

### Security Architecture

1. **Authentication Flow**
   - User enters username + password
   - PBKDF2 derives encryption key
   - Key stored in memory (never persisted)
   - GunDB user authentication for peer identity

2. **Data Encryption**
   - All document content encrypted before storage
   - Encryption keys never leave client
   - Shared documents: recipient gets encrypted key (encrypted with their public key)

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
- **Monaco Editor** or **CodeMirror 6**: For syntax highlighting
- **react-markdown**: For markdown rendering
- **zustand** or **jotai**: State management
- **crypto-js** or **Web Crypto API**: Encryption
- **OpenRouter SDK**: LLM API client

### Infrastructure Dependencies

- Cloudflare Pages account
- Cloudflare Workers account (for relay)
- OpenRouter API (user-provided keys)

### Internal Dependencies

The tickets will be created in this order:

1. **TICKET-002**: Project Setup (React, Vite, TypeScript, dependencies)
2. **TICKET-003**: GunDB Integration (setup, basic operations)
3. **TICKET-004**: Encryption System (PBKDF2, document encryption)
4. **TICKET-005**: Authentication System (login, key derivation)
5. **TICKET-006**: Markdown Editor Component (syntax highlighting, editing)
6. **TICKET-007**: Document Management (CRUD operations, list view)
7. **TICKET-008**: Sharing & Permissions System
8. **TICKET-009**: OpenRouter LLM Integration
9. **TICKET-010**: UI Theme System (dark/light mode)
10. **TICKET-011**: Cloudflare Workers Relay
11. **TICKET-012**: Cloudflare Pages Deployment

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
   - Risk: Concurrent edits from multiple devices
   - Mitigation: Last-write-wins with timestamps, document locking for collaboration

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
