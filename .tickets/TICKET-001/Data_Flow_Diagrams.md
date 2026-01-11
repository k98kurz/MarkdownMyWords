# Data Flow Diagrams

## User Authentication Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Enter username + password
     ▼
┌─────────────────┐
│  Login Form     │
└────┬────────────┘
     │
     │ 2. Retrieve salt from GunDB
     ▼
┌─────────────────┐
│  GunDB          │
│  user~{id}/salt │
└────┬────────────┘
     │
     │ 3. Salt returned
     ▼
┌─────────────────┐
│  PBKDF2         │
│  Key Derivation │
└────┬────────────┘
     │
     │ 4. Derived key
     ▼
┌─────────────────┐
│  Memory Storage │
│  (Session Key)   │
└────┬────────────┘
     │
     │ 5. Authenticate with GunDB
     ▼
┌─────────────────┐
│  GunDB Auth     │
└────┬────────────┘
     │
     │ 6. Success
     ▼
┌─────────────────┐
│  Main App       │
└─────────────────┘
```

## Document Creation Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Click "New Document"
     ▼
┌─────────────────┐
│  DocumentList   │
└────┬────────────┘
     │
     │ 2. Generate docId
     ▼
┌─────────────────┐
│  UUID Generator │
└────┬────────────┘
     │
     │ 3. docId
     ▼
┌─────────────────┐
│  Create Node    │
│  doc~{docId}    │
└────┬────────────┘
     │
     │ 4. Encrypt content
     ▼
┌─────────────────┐
│  Encryption     │
│  Service        │
└────┬────────────┘
     │
     │ 5. Encrypted content
     ▼
┌─────────────────┐
│  GunDB          │
│  Store Document │
└────┬────────────┘
     │
     │ 6. Add to user's document list
     ▼
┌─────────────────┐
│  Update User    │
│  Document Index │
└────┬────────────┘
     │
     │ 7. Open in editor
     ▼
┌─────────────────┐
│  MarkdownEditor  │
└─────────────────┘
```

## Document Edit Flow (Single User)

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Edit document
     ▼
┌─────────────────┐
│  MarkdownEditor │
└────┬────────────┘
     │
     │ 2. Content changed (debounced)
     ▼
┌─────────────────┐
│  Debounce        │
│  (500ms)         │
└────┬────────────┘
     │
     │ 3. Encrypt new content
     ▼
┌─────────────────┐
│  Encryption      │
│  Service         │
└────┬────────────┘
     │
     │ 4. Update GunDB
     ▼
┌─────────────────┐
│  GunDB          │
│  doc~{docId}    │
└────┬────────────┘
     │
     │ 5. Sync to other devices
     ▼
┌─────────────────┐
│  P2P Sync       │
│  (GunDB)        │
└────┬────────────┘
     │
     │ 6. Last-write-wins
     ▼
┌─────────────────┐
│  Other Devices   │
│  Updated         │
└─────────────────┘
```

## Document Edit Flow (Shared Document)

```
┌──────────────┐
│  Collaborator│
└──────┬───────┘
       │
       │ 1. Edit shared document
       ▼
┌─────────────────┐
│  MarkdownEditor │
└──────┬──────────┘
       │
       │ 2. Check if shared
       ▼
┌─────────────────┐
│  Check Sharing  │
│  Status         │
└──────┬──────────┘
       │
       │ 3. Create branch
       ▼
┌─────────────────┐
│  Branch Service │
│  Create Branch  │
└──────┬──────────┘
       │
       │ 4. Encrypt proposed content
       ▼
┌─────────────────┐
│  Encryption     │
│  Service        │
└──────┬──────────┘
       │
       │ 5. Store branch node
       ▼
┌─────────────────┐
│  GunDB          │
│  branch~{id}    │
└──────┬──────────┘
       │
       │ 6. Notify owner
       ▼
┌─────────────────┐
│  Owner          │
│  Notification   │
└──────┬──────────┘
       │
       │ 7. Owner reviews
       ▼
┌─────────────────┐
│  BranchMergeUI  │
└──────┬──────────┘
       │
       │ 8. Owner merges
       ▼
┌─────────────────┐
│  Merge Branch   │
│  to Main        │
└──────┬──────────┘
       │
       │ 9. Update main document
       ▼
┌─────────────────┐
│  GunDB          │
│  doc~{docId}    │
└─────────────────┘
```

## Sharing Flow

```
┌─────────┐
│  Owner  │
└────┬────┘
     │
     │ 1. Share document
     ▼
┌─────────────────┐
│  SharingSidebar │
└────┬────────────┘
     │
     │ 2. Add collaborator
     ▼
┌─────────────────┐
│  Get Collaborator│
│  Public Key     │
└────┬────────────┘
     │
     │ 3. Generate/Get doc key
     ▼
┌─────────────────┐
│  Document Key  │
│  Management     │
└────┬────────────┘
     │
     │ 4. Encrypt doc key
     ▼
┌─────────────────┐
│  RSA Encryption │
│  (Public Key)   │
└────┬────────────┘
     │
     │ 5. Store encrypted key
     ▼
┌─────────────────┐
│  GunDB          │
│  sharing/docKey │
└────┬────────────┘
     │
     │ 6. Add to access list
     ▼
┌─────────────────┐
│  Update Access  │
│  Lists          │
└────┬────────────┘
     │
     │ 7. Create reference
     ▼
┌─────────────────┐
│  Collaborator's │
│  Document List  │
└─────────────────┘
```

## AI Review Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Click "Review Document"
     ▼
┌─────────────────┐
│  AISidebar      │
└────┬────────────┘
     │
     │ 2. Get API key
     ▼
┌─────────────────┐
│  Get Encrypted  │
│  API Key        │
└────┬────────────┘
     │
     │ 3. Decrypt API key
     ▼
┌─────────────────┐
│  Decryption     │
│  Service        │
└────┬────────────┘
     │
     │ 4. Prepare request
     ▼
┌─────────────────┐
│  LLM Service   │
│  Review         │
└────┬────────────┘
     │
     │ 5. POST to OpenRouter
     ▼
┌─────────────────┐
│  OpenRouter API │
└────┬────────────┘
     │
     │ 6. Review results
     ▼
┌─────────────────┐
│  Parse Results  │
└────┬────────────┘
     │
     │ 7. Display suggestions
     ▼
┌─────────────────┐
│  AISidebar      │
│  Results        │
└─────────────────┘
```

## Conflict Resolution Flow

### Single User, Multi-Device

```
Device 1                    Device 2
    │                           │
    │ Edit doc                  │
    │                           │
    ▼                           │
Update GunDB                   │
    │                           │
    │ Sync                      │
    │───────────────────────────►│
    │                           │
    │                           │ Edit same doc
    │                           │
    │                           ▼
    │                      Update GunDB
    │                           │
    │                           │ Sync
    │◄──────────────────────────│
    │                           │
    ▼                           ▼
Last-write-wins
(Timestamp comparison)
    │                           │
    ▼                           ▼
Device 1 wins              Device 2 loses
(Newer timestamp)          (Older timestamp)
```

### Shared Document, Multiple Contributors

```
Contributor 1          Contributor 2          Owner
    │                       │                   │
    │ Edit                   │                   │
    │                        │                   │
    ▼                        │                   │
Create Branch 1              │                   │
    │                        │                   │
    │                        │ Edit              │
    │                        │                   │
    │                        ▼                   │
    │                   Create Branch 2          │
    │                        │                   │
    │                        │                   │
    │                        │                   │
    │                        │                   ▼
    │                        │              Review Branches
    │                        │                   │
    │                        │                   │
    │                        │                   ▼
    │                        │              Merge Branch 1
    │                        │                   │
    │                        │                   │
    │                        │                   ▼
    │                        │              Update Main
    │                        │                   │
    │                        │                   │
    │                        │                   ▼
    │                        │              Merge Branch 2
    │                        │                   │
    │                        │                   │
    │                        │                   ▼
    │                        │              Update Main
    │                        │                   │
    ▼                        ▼                   ▼
Both branches merged      Both branches merged  Main updated
```

## Encryption Flow

### Document Encryption

```
Plaintext Document
    │
    ▼
Get User Key
(PBKDF2 derived)
    │
    ▼
Generate Random IV
    │
    ▼
AES-256-GCM Encrypt
    │
    ▼
Encrypted Content + IV
    │
    ▼
Store in GunDB
```

### Shared Document Key Encryption

```
Document Key
    │
    ▼
Get Collaborator's
Public Key
    │
    ▼
RSA-OAEP Encrypt
    │
    ▼
Encrypted Document Key
    │
    ▼
Store in GunDB
sharing/documentKey/{userId}
```

## Sync Flow

```
Local Change
    │
    ▼
Update GunDB
    │
    ▼
GunDB P2P Sync
    │
    ├─────────► Peer 1
    │
    ├─────────► Peer 2
    │
    └─────────► Relay Server
                    │
                    └─────────► Other Peers
```
