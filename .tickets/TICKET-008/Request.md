# [TICKET-008] Sharing & Permissions System

## Metadata
- **Status**: draft
- **Complexity**: plan
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 8h
- **Depends on**: TICKET-003, TICKET-004, TICKET-007

## Request

Implement document sharing and permissions system with branching model for conflict resolution in shared documents.

### User Story

As a user, I want to share documents with others and manage permissions so that I can collaborate on documents while maintaining control.

### Requirements

1. **Sharing Operations**
   - Share document with specific users using SEA's ECDH
   - Grant read/write permissions
   - Generate public share links
   - Revoke access
   - Use document-specific keys for branching model

2. **Branching System**
   - Create branches to begin editing shared documents
   - Multiple branches per collaborator
   - Switch between branches
   - Delete own branches
   - Merge changes from any branch into working branch (default: Main, with dropdown for other branches)
   - All merges use merge diff view mechanism (same as merging into Main)
   - Submit branch for review (owner only can merge/reject)
   - List pending/submitted branches
   - Diff view for branches

3. **Permission Management**
   - Owner, write, read access levels
   - Access control checks
   - Permission-based UI

4. **UI Components**
   - SharingSidebar component
   - BranchListView component (shows branches and permissions)
   - BranchMergeUI component
   - Collaborator list
   - Branch list with diff view

## Acceptance Criteria

### Sharing Operations
- [ ] Owner can share document with specific users by username/userId
- [ ] Owner can grant read or write permissions when sharing
- [ ] Owner can generate public share links with secure tokens
- [ ] Owner can revoke access for collaborators
- [ ] Collaborators receive document reference in their document list
- [ ] Public share links allow access via token in URL
- [ ] Document-specific keys are generated on first share
- [ ] Document keys are encrypted per collaborator using SEA's ECDH

### Permission Management
- [ ] Permission levels (owner/write/read) are enforced in all operations
- [ ] Access control checks prevent unauthorized operations
- [ ] UI reflects permission levels (disable actions user can't perform)
- [ ] Permission errors are handled gracefully with user-friendly messages
- [ ] Owner-only operations (merge, revoke, delete) are properly restricted

### Branching System
- [ ] Collaborators can create branches when editing shared documents
- [ ] Collaborators can have multiple branches per document
- [ ] Collaborators can switch between their branches
- [ ] Collaborators can delete their own branches
- [ ] Collaborators can merge changes from any branch into their working branch
- [ ] Default merge source is Main branch (default selection, not automatic merge)
- [ ] Dropdown menu allows selecting other branches as merge source
- [ ] All merges (from Main or other branches) use merge diff view mechanism
- [ ] Merge diff view shows changes before applying merge
- [ ] User can review and confirm merge before applying
- [ ] Collaborators can submit branch for review (status: pending → submitted)
- [ ] Branches are created with "pending" status (editing state)
- [ ] Owner can view list of all submitted branches
- [ ] Owner can view diff between branch and main document
- [ ] Owner can merge branches (updates main document)
- [ ] Owner can reject branches (with optional reason)
- [ ] Branch status updates correctly (pending → submitted → merged/rejected)
- [ ] Branch content is encrypted with document key
- [ ] New edits from collaborator create new branch after previous branch is merged/rejected

### UI Components
- [ ] SharingSidebar component displays collaborators and sharing options
- [ ] CollaboratorList shows all users with access
- [ ] AddCollaboratorForm allows adding new collaborators
- [ ] PublicSharingToggle enables/disables public sharing
- [ ] ShareTokenDisplay shows share link with copy functionality
- [ ] BranchListView shows the document branches and permissions (i.e. what the user can do)
- [ ] BranchMergeUI displays pending branches with diff view
- [ ] BranchDiffView highlights changes between branch and main
- [ ] Merge button defaults to merging from Main branch (as source selection)
- [ ] Merge dropdown menu shows all available branches for selection
- [ ] Merge diff view displays for all merges (Main and other branches)
- [ ] Merge diff view shows changes from selected source branch
- [ ] User can review diff and confirm before applying merge
- [ ] Merge/reject buttons work correctly with confirmation

### Conflict Resolution
- [ ] Single-user documents use last-write-wins strategy
- [ ] Shared documents use branching model (no direct edits to main)
- [ ] Branch creation is automatic when collaborator edits shared doc
- [ ] Collaborators can sync their branch with any other branch before submitting (default: Main)
- [ ] Conflict resolution works correctly across all scenarios

## Technical Notes

### Sharing Flow

1. Owner shares document with user(s) or generates public link
2. Generate document-specific key (if first share - for branching model)
3. Encrypt document with document key (manual AES-256-GCM via encryptionService)
4. For each collaborator:
   - Get collaborator's public key from GunDB
   - Encrypt document key with collaborator's public key using SEA's ECDH
   - Store encrypted key in document's sharing metadata
5. Add collaborator to access list (readAccess or writeAccess)
6. Create document reference for collaborator in their user node
7. Notify collaborator (optional - via GunDB subscription)

### Branching Flow

1. Collaborator edits shared document
2. Create branch node to begin editing (encrypted with document key)
3. Set branch status to "pending"
4. Allow collaborator to merge in changes from any branch (default: Main, with dropdown to select other branches)
   - Merge process uses merge diff view mechanism (same for all branches)
   - User reviews diff and confirms before merge is applied
5. Once the collaborator is happy with all changes, submit for merging by updating status to "submitted"
6. Notify owner (via GunDB subscription)
7. Owner reviews branch (views diff)
8. Owner merges or rejects
9. If merged: update main document with branch content
10. Update branch status to "merged" or "rejected"
11. Future edits from that collaborator will use a new branch; collaborator will have ability to switch between and delete his/her branches

## Related

- TICKET-001: Architecture (sharing model reference)
- TICKET-003: GunDB integration
- TICKET-004: Encryption system
- TICKET-007: Document management
