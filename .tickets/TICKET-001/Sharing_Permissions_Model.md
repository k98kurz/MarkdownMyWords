# Sharing & Permissions Model

## Overview

MarkdownMyWords supports multiple sharing models with different permission levels and conflict resolution strategies based on document ownership and collaboration status.

## Permission Levels

### Owner
- **Full Control**: Create, read, update, delete document
- **Sharing Management**: Grant/revoke access, change permissions
- **Branch Management**: Review, merge, and reject branches
- **Document Settings**: Change sharing settings, delete document

### Write Access
- **Edit Capabilities**:
  - For single-owner documents: Direct edits (last-write-wins)
  - For shared documents: Create branches for proposed changes
- **View**: Read document content
- **Branch Creation**: Create branches for proposed changes
- **Cannot**: Merge branches, change sharing settings, delete document

### Read Access
- **View Only**: Read document content
- **Branch Creation**: Can create branches to propose changes
- **Cannot**: Edit directly, merge branches, change settings

### Public Access
- **Access Method**: Via share token in URL
- **Permissions**: Read-only by default
- **Optional**: Can grant write access via token parameters

## Document Sharing States

### Private Document
- **Owner**: Single user
- **Access**: Only owner
- **Conflict Resolution**: Last-write-wins (multi-device)
- **Branches**: Not applicable

### Shared Document (Single Collaborator)
- **Owner**: Original creator
- **Access**: Owner + collaborators
- **Conflict Resolution**: Branching model
- **Branches**: Collaborators create branches, owner merges

### Shared Document (Multiple Collaborators)
- **Owner**: Original creator
- **Access**: Owner + multiple collaborators
- **Conflict Resolution**: Branching model
- **Branches**: Each collaborator can create branches independently

### Public Document
- **Owner**: Original creator
- **Access**: Anyone with link (via shareToken)
- **Conflict Resolution**: Branching model (if write access granted)
- **Branches**: Public users can create branches if write access enabled

## Sharing Workflow

### Sharing a Document

```typescript
interface ShareDocumentRequest {
  docId: string;
  userIds?: string[];           // Specific users to share with
  accessLevel: 'read' | 'write'; // Permission level
  isPublic?: boolean;            // Make publicly accessible
  publicWriteAccess?: boolean;   // Allow public users to create branches
}

async function shareDocument(request: ShareDocumentRequest) {
  // 1. Generate document-specific encryption key (if not already shared)
  // This is needed for the branching model (document-specific keys)
  const docKey = await getOrGenerateDocumentKey(request.docId);

  // 2. For each user, encrypt document key using SEA's ECDH
  for (const userId of request.userIds) {
    const recipientPub = await getUserPublicKey(userId); // SEA public key
    // Use SEA's ECDH to encrypt the document key
    const encryptedKey = await SEA.encrypt(docKey, recipientPub);
    await storeEncryptedKey(request.docId, userId, encryptedKey);
  }

  // 3. Update sharing metadata
  await updateSharingMetadata(request.docId, {
    readAccess: request.accessLevel === 'read' ? request.userIds : [],
    writeAccess: request.accessLevel === 'write' ? request.userIds : [],
    isPublic: request.isPublic,
    publicWriteAccess: request.publicWriteAccess
  });

  // 4. Create document reference for each collaborator
  for (const userId of request.userIds) {
    await addDocumentReference(userId, request.docId, request.accessLevel);
  }
}
```

### Revoking Access

```typescript
async function revokeAccess(docId: string, userId: string) {
  // 1. Remove user from access lists
  await removeFromAccessLists(docId, userId);

  // 2. Remove encrypted document key
  await removeEncryptedKey(docId, userId);

  // 3. Remove document reference from user
  await removeDocumentReference(userId, docId);

  // 4. Reject any pending branches from that user
  await rejectUserBranches(docId, userId);
}
```

## Branching Model for Shared Documents

### Creating a Branch

```typescript
interface CreateBranchRequest {
  docId: string;
  proposedContent: string;      // Proposed changes
  description?: string;          // Optional description
}

async function createBranch(request: CreateBranchRequest) {
  // 1. Verify user has write or read access
  const access = await checkDocumentAccess(request.docId, currentUserId);
  if (!access.canCreateBranches) {
    throw new Error('Insufficient permissions');
  }

  // 2. Get current document version
  const currentVersion = await getDocumentVersion(request.docId);

  // 3. Encrypt proposed content with document-specific key
  // (Manual encryption needed because we use document-specific keys for branching)
  const docKey = await getDocumentKey(request.docId);
  const encrypted = await encryptDocument(request.proposedContent, docKey);

  // 4. Create branch node
  const branchId = `branch~${currentUserId}~${Date.now()}`;
  await createBranchNode(branchId, {
    encryptedContent: encrypted.encryptedContent,
    contentIV: encrypted.contentIV,
    createdBy: currentUserId,
    createdAt: Date.now(),
    status: 'pending',
    parentVersion: currentVersion,
    description: request.description
  });

  // 5. Add branch reference to document
  await addBranchReference(request.docId, branchId);

  // 6. Notify document owner (if not current user)
  if (await isDocumentOwner(request.docId, currentUserId)) {
    // Owner editing directly, no branch needed
    return;
  }
  await notifyOwner(request.docId, branchId);
}
```

### Branch States

1. **Pending**: Branch created, awaiting owner review
2. **Merged**: Branch merged into main document
3. **Rejected**: Branch rejected by owner

### Merging a Branch

```typescript
interface MergeBranchRequest {
  docId: string;
  branchId: string;
}

async function mergeBranch(request: MergeBranchRequest) {
  // 1. Verify user is document owner
  if (!await isDocumentOwner(request.docId, currentUserId)) {
    throw new Error('Only owner can merge branches');
  }

  // 2. Get branch content
  const branch = await getBranch(request.branchId);
  if (branch.status !== 'pending') {
    throw new Error('Branch is not pending');
  }

  // 3. Decrypt branch content
  const docKey = await getDocumentKey(request.docId);
  const content = await decryptDocument(
    { encryptedContent: branch.encryptedContent, contentIV: branch.contentIV },
    docKey
  );

  // 4. Update main document
  await updateMainDocument(request.docId, content, {
    mergedFrom: request.branchId,
    mergedBy: currentUserId,
    mergedAt: Date.now()
  });

  // 5. Update branch status
  await updateBranchStatus(request.branchId, 'merged', {
    mergedBy: currentUserId,
    mergedAt: Date.now()
  });

  // 6. Notify branch creator
  await notifyBranchCreator(request.branchId, 'merged');

  // 7. Optionally reject other pending branches (if conflicts)
  // This is a design decision - could allow multiple merges
}
```

### Rejecting a Branch

```typescript
async function rejectBranch(branchId: string, reason?: string) {
  // 1. Verify user is document owner
  const docId = await getDocumentFromBranch(branchId);
  if (!await isDocumentOwner(docId, currentUserId)) {
    throw new Error('Only owner can reject branches');
  }

  // 2. Update branch status
  await updateBranchStatus(branchId, 'rejected', {
    rejectedBy: currentUserId,
    rejectedAt: Date.now(),
    reason: reason
  });

  // 3. Notify branch creator
  await notifyBranchCreator(branchId, 'rejected', reason);
}
```

## Conflict Resolution Strategies

### Strategy 1: Last-Write-Wins (Single User, Multi-Device)

**Scenario**: Same user editing document from multiple devices

**Implementation**:
```typescript
async function updateDocument(docId: string, content: string) {
  // 1. Get current document
  const current = await getDocument(docId);

  // 2. Check if user is owner (single-user document)
  const isOwner = await isDocumentOwner(docId, currentUserId);
  const isShared = await isSharedDocument(docId);

  if (isOwner && !isShared) {
    // Single-user document: last-write-wins
    await updateWithTimestamp(docId, content, {
      lastModifiedBy: currentUserId,
      updatedAt: Date.now()
    });
  } else {
    // Shared document: create branch
    await createBranch({ docId, proposedContent: content });
  }
}
```

**Characteristics**:
- Automatic conflict resolution
- No manual intervention
- Fast and simple
- Potential data loss if concurrent edits

### Strategy 2: Branching Model (Shared Documents)

**Scenario**: Multiple users collaborating on document

**Implementation**: See branch creation and merge workflows above

**Characteristics**:
- Manual review and merge
- No data loss
- Clear ownership and control
- Requires owner intervention

## Access Control Implementation

### Permission Check

```typescript
interface DocumentAccess {
  canRead: boolean;
  canWrite: boolean;
  canCreateBranches: boolean;
  canMergeBranches: boolean;
  canShare: boolean;
  canDelete: boolean;
}

async function checkDocumentAccess(docId: string, userId: string): Promise<DocumentAccess> {
  const doc = await getDocument(docId);
  const sharing = doc.sharing;

  const isOwner = sharing.owner === userId;
  const hasReadAccess = sharing.readAccess.includes(userId);
  const hasWriteAccess = sharing.writeAccess.includes(userId);
  const isPublic = sharing.isPublic;

  return {
    canRead: isOwner || hasReadAccess || hasWriteAccess || isPublic,
    canWrite: isOwner || (hasWriteAccess && !isSharedDocument(docId)),
    canCreateBranches: isOwner || hasWriteAccess || hasReadAccess ||
                       (isPublic && sharing.publicWriteAccess),
    canMergeBranches: isOwner,
    canShare: isOwner,
    canDelete: isOwner
  };
}
```

### Operation Authorization

```typescript
async function authorizeOperation(
  docId: string,
  operation: 'read' | 'write' | 'createBranch' | 'mergeBranch' | 'share' | 'delete',
  userId: string
): Promise<boolean> {
  const access = await checkDocumentAccess(docId, userId);

  switch (operation) {
    case 'read':
      return access.canRead;
    case 'write':
      return access.canWrite;
    case 'createBranch':
      return access.canCreateBranches;
    case 'mergeBranch':
      return access.canMergeBranches;
    case 'share':
      return access.canShare;
    case 'delete':
      return access.canDelete;
    default:
      return false;
  }
}
```

## Public Sharing

### Share Token Generation

```typescript
async function generateShareToken(docId: string): Promise<string> {
  // Generate cryptographically secure random token
  const token = arrayBufferToBase64(
    crypto.getRandomValues(new Uint8Array(32))
  );

  // Store token in document sharing metadata
  await updateSharingMetadata(docId, {
    shareToken: token,
    isPublic: true
  });

  return token;
}
```

### Accessing via Share Token

```typescript
async function accessViaToken(token: string): Promise<string | null> {
  // Find document with matching token
  const docId = await findDocumentByToken(token);
  if (!docId) {
    return null;
  }

  // Check if public access is enabled
  const doc = await getDocument(docId);
  if (!doc.sharing.isPublic) {
    return null;
  }

  return docId;
}
```

## UI Components

### Sharing Sidebar

```typescript
interface SharingSidebarProps {
  docId: string;
  onShare: (request: ShareDocumentRequest) => void;
  onRevoke: (userId: string) => void;
  onGenerateToken: () => void;
}

// Displays:
// - Current collaborators
// - Permission levels
// - Add collaborator form
// - Public sharing toggle
// - Share token display
```

### Branch Merge UI

```typescript
interface BranchMergeUIProps {
  docId: string;
  branches: Branch[];
  onMerge: (branchId: string) => void;
  onReject: (branchId: string, reason?: string) => void;
}

// Displays:
// - List of pending branches
// - Diff view (main vs branch)
// - Branch metadata (author, timestamp, description)
// - Merge/Reject buttons
// - Branch history
```

## Security Considerations

### Access Control

- Always verify permissions before operations
- Check ownership before merge/delete operations
- Validate share tokens before granting access
- Encrypt document keys for each collaborator

### Branch Security

- Only owner can merge branches
- Branch content encrypted with document key
- Branch status changes are logged
- Rejected branches remain for audit trail

### Token Security

- Use cryptographically secure random tokens
- Tokens should be long enough (32+ bytes)
- Consider token expiration (optional)
- Rate limit token-based access

## Implementation Checklist

- [ ] Permission level definitions
- [ ] Access control checks
- [ ] Share document functionality
- [ ] Revoke access functionality
- [ ] Branch creation (for shared documents)
- [ ] Branch merge functionality
- [ ] Branch rejection functionality
- [ ] Public sharing with tokens
- [ ] Sharing sidebar UI component
- [ ] Branch merge UI component
- [ ] Notification system (for branch events)
- [ ] Conflict resolution routing (last-write-wins vs branching)
