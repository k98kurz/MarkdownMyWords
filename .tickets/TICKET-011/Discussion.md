# Discussion

## Relay Purpose

### Why Needed?
- Helps with peer discovery
- Assists NAT traversal
- Fallback when direct connection fails
- Improves connectivity

### What It Does
- Relays WebSocket messages between peers
- Implements GunDB mesh network protocol
- Message ID deduplication (prevents rebroadcast storms)
- Message validation (prevents unauthorized/invalid writes)
- Data validation on read (prevents corrupted data)
- Stateful coordination via Durable Objects
- No persistent data storage

## Cloudflare Workers + Durable Objects

### Architecture
- Workers handle HTTP/WebSocket upgrades (stateless entry point)
- Durable Objects coordinate all relay connections (stateful)
- Single Durable Object instance manages all concurrent peers
- Supports WebSocket hibernation for cost efficiency

### Free Tier
- Workers: 100k requests/day
- Durable Objects: 5M requests/month
- Sufficient for MVP
- Good performance with global edge network

### Deployment
- Use Wrangler CLI
- Configure Durable Objects binding
- Automatic HTTPS
- Global edge network

## Security & Validation

### Message Validation
- Validate GunDB message format before processing
- Reject messages without required fields (message ID, etc.)
- Prevents unauthorized/invalid writes from other applications
- Ensures protocol compliance

### Data Validation
- Validate messages before relaying to peers
- Prevents corrupted data from being propagated
- Client-side validation also required (defense in depth)

### Message Deduplication
- Fixed-size message ID cache (1,000 entries)
- Prevents rebroadcast storms
- Implements GunDB mesh network protocol
- Bumps seen message IDs to top (liveliness tracking)

### Other Security
- No authentication needed (GunDB handles it)
- CORS configured
- Rate limiting (Cloudflare handles)
- No data storage
