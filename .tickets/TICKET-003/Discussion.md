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

## Notes

- GunDB uses graph database model
- Nodes referenced by "soul" (unique ID)
- Real-time sync happens automatically
- Handle offline scenarios
