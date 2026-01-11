# Discussion

## Document Lifecycle

1. Create: Generate docId, encrypt content, store in GunDB
2. Load: Retrieve from GunDB, decrypt content, display in editor
3. Update: Encrypt new content, update in GunDB, sync to peers
4. Delete: Remove from GunDB, remove from user's list

## Auto-save Strategy

- Debounce user input (500ms)
- Save automatically on change
- Show visual feedback (space-efficient status indicator widget somewhere; click icon to expand)
- Handle offline scenarios (queue saves)

## Document List

- Load on app start
- Refresh on document changes
- Search/filter client-side
- Sort by: name, date modified, date created

## Error Handling

- Network errors: Queue for retry
- Encryption errors: Show error message
- Permission errors: Show access denied
- Storage errors: Show quota warning
