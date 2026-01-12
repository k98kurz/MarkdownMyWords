# Discussion

## GunDB Configuration

### Relay Server
- Use Cloudflare Workers relay (TICKET-011)
- Fallback to direct WebRTC connections
- Handle connection failures gracefully

### Storage
- IndexedDB for browser storage
- Radisk for persistence
- Handle storage quota errors

### Peer Connections
- WebRTC for direct connections
- Relay for NAT traversal
- Handle connection state changes

## Namespacing

**IMPORTANT**: All GunDB paths are namespaced with the app name (`markdownmywords` by default) to avoid collisions when multiple applications share the same GunDB relay server.

- User paths: `{appNamespace}~user~{userId}` (e.g., `markdownmywords~user~abc123`)
- Document paths: `{appNamespace}~doc~{docId}` (e.g., `markdownmywords~doc~xyz789`)
- Branch paths: `{appNamespace}~branch~{userId}~{timestamp}` (e.g., `markdownmywords~branch~abc123~1234567890`)

The namespace is configurable via `GunConfig.appNamespace` during initialization, but defaults to `'markdownmywords'`.

## Notes

- GunDB uses graph database model
- Nodes referenced by "soul" (unique ID)
- Real-time sync happens automatically
- Handle offline scenarios
- All paths are namespaced to prevent collisions
