# Discussion

## Conflict Resolution

### Single User, Multi-Device
- Last-write-wins strategy
- Timestamp-based resolution
- Automatic, no manual intervention

### Shared Documents
- Git branching model
- Collaborators create branches
- Owner reviews and merges
- Manual conflict resolution

## Branching Model

### Branch States
- Pending: Collaborator is actively editing (not yet submitted)
- Submitted: Collaborator has submitted for owner review
- Merged: Accepted and merged into main document
- Rejected: Declined by owner

### Branch Lifecycle
1. Collaborator creates branch (status: "pending")
2. Collaborator edits branch, can merge changes from any branch (default: Main)
   - Merge process uses merge diff view (same mechanism for all branches)
   - User reviews diff and confirms before merge is applied
3. Collaborator submits branch for review (status: "pending" → "submitted")
4. Owner notified of submitted branch
5. Owner reviews diff
6. Owner merges or rejects (status: "submitted" → "merged"/"rejected")
7. Future edits from collaborator create new branch
8. Collaborator can switch between and delete their own branches

## Permission Levels

- Owner: Full control, can merge/reject branches, edit main directly
- Write: Can create branches, edit branches, merge from any branch, submit for review (single-user docs: direct edit)
- Read: Can view, create branches, merge from any branch, submit for review
- Public: Token-based access (permissions depend on token settings)

## Multiple Branches Per Collaborator

- Each collaborator can have multiple branches per document
- Collaborators can switch between their branches
- Collaborators can delete their own branches (only pending/submitted, not merged/rejected)
- Only one branch per collaborator can be in "pending" state at a time (or allow multiple?)
- After branch is merged/rejected, new edits create a new branch from Main

## Security

- Document keys encrypted per collaborator
- Access control enforced
- Branch content encrypted
- Only owner can merge
