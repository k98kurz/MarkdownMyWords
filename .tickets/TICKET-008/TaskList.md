# Task List

## Sharing Operations

- [ ] Implement shareDocument in gunService
- [ ] Implement revokeAccess in gunService
- [ ] Implement generateShareToken
- [ ] Implement getDocumentByToken
- [ ] Generate document-specific keys
- [ ] Encrypt keys for collaborators
- [ ] Update access lists

## Branching System

- [ ] Create branchService
- [ ] Implement createBranch
- [ ] Implement getBranches (filter by user, status, etc.)
- [ ] Implement getUserBranches (get all branches for a specific user)
- [ ] Implement switchBranch (change active branch for editing)
- [ ] Implement deleteBranch (allow users to delete their own branches)
- [ ] Implement mergeFromBranch (merge changes from any branch into working branch)
- [ ] Default merge source is Main branch (default selection)
- [ ] Support selecting any branch as merge source
- [ ] All merges use same merge diff view mechanism (regardless of source)
- [ ] Generate merge diff for any source branch
- [ ] Apply merge after user confirmation
- [ ] Implement submitBranch (change status from pending to submitted)
- [ ] Implement mergeBranch (owner only - merge into main)
- [ ] Implement rejectBranch (owner only)
- [ ] Implement getBranchDiff
- [ ] Handle branch status updates (pending → submitted → merged/rejected)

## Permission Management

- [ ] Create permission check utilities
- [ ] Implement access control checks
- [ ] Enforce permissions in operations
- [ ] Handle permission errors
- [ ] Update UI based on permissions

## Sharing UI

- [ ] Create SharingSidebar component
- [ ] Create CollaboratorList component
- [ ] Create AddCollaboratorForm
- [ ] Create PublicSharingToggle
- [ ] Create ShareTokenDisplay
- [ ] Add copy link functionality

## Branch Merge UI

- [ ] Create BranchListView component (shows branches and permissions)
- [ ] Create BranchMergeUI component (owner view for submitted branches)
- [ ] Create PendingBranchesList
- [ ] Create BranchItem component
- [ ] Create BranchDiffView component
- [ ] Implement branch switching UI
- [ ] Implement branch deletion UI (for own branches)
- [ ] Implement merge button (default: Main as source, opens merge diff view)
- [ ] Implement merge source dropdown menu (for selecting other branches)
- [ ] Display available branches in dropdown (filter by permissions/access)
- [ ] Implement merge diff view for all merges (Main and other branches)
- [ ] Merge diff view shows changes from selected source branch
- [ ] Implement merge confirmation dialog (review diff before applying)
- [ ] Implement submit branch button (for collaborators)
- [ ] Implement diff highlighting
- [ ] Add merge/reject buttons (owner only)
- [ ] Add merge confirmation

## Integration

- [ ] Connect sharing to document store
- [ ] Connect branching to editor (auto-create branch on edit, switch branches)
- [ ] Handle branch notifications (owner notified when branch submitted)
- [ ] Handle branch switching in editor (load branch content when switching)
- [ ] Handle sharing notifications (collaborator notified when shared)
- [ ] Integrate with encryptionService for document key operations
- [ ] Integrate with gunService for GunDB operations
- [ ] Handle error cases (user not found, permission denied, etc.)
- [ ] Test sharing workflow
- [ ] Test branching workflow
- [ ] Test permission enforcement
- [ ] Test error handling scenarios