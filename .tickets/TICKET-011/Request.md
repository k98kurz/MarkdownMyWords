# [TICKET-011] Cloudflare Workers Relay

## Metadata
- **Status**: ready
- **Complexity**: medium
- **Service(s)**: infrastructure
- **Created**: 2026-01-11
- **Estimate**: 4h

## Request

Deploy a GunDB relay server on Cloudflare Workers to help with peer discovery and connectivity.

### User Story

As a developer, I want a relay server deployed so that users can connect to each other even when direct WebRTC connections fail.

### Requirements

1. **Relay Server**
   - WebSocket relay using Cloudflare Workers + Durable Objects
   - Handle WebSocket upgrades
   - Relay messages between multiple concurrent peers
   - Stateful coordination via Durable Objects
   - GunDB mesh network protocol compliance
   - Message ID deduplication (1,000 message cache)
   - No persistent data storage

2. **Deployment**
   - Cloudflare Workers + Durable Objects setup
   - Wrangler configuration
   - Environment variables
   - Deployment script

3. **Configuration**
   - WebSocket endpoint
   - CORS headers
   - Error handling

4. **Security & Validation**
   - Validate message format (GunDB protocol compliance)
   - Prevent unauthorized writes (message validation)
   - Validate data on read to prevent corrupted data loading
   - Message ID deduplication to prevent rebroadcast storms

## Acceptance Criteria

- [ ] Relay server code written (Worker + Durable Object)
- [ ] GunDB mesh network protocol implemented
- [ ] Message ID deduplication (1,000 message cache)
- [ ] Message validation (prevent unauthorized/invalid writes)
- [ ] Data validation on read (prevent corrupted data)
- [ ] Cloudflare Workers and Durable Objects configured
- [ ] Relay deployed successfully
- [ ] WebSocket connections working
- [ ] Message relay working (protocol compliant)
- [ ] CORS configured correctly
- [ ] Error handling implemented
- [ ] Documentation created

## Technical Notes

### Architecture

Workers are stateless and cannot coordinate multiple WebSocket connections. Use a Durable Object to maintain state and coordinate all relay connections.

**Protocol Compliance**: Must implement GunDB's mesh network protocol to ensure compatibility with existing GunDB client libraries. The relay must handle message deduplication, ACK messages, and message routing as specified in the protocol.

### Worker (Entry Point)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      // Route to Durable Object for stateful coordination
      const id = env.RELAY.idFromName('main');
      const stub = env.RELAY.get(id);
      return stub.fetch(request);
    }
    return new Response('GunDB Relay', { status: 200 });
  }
};
```

### Durable Object (Stateful Coordinator)

```typescript
export class Relay {
  private connections: Map<string, WebSocket> = new Map();
  // GunDB protocol: Fixed-size message ID cache (1,000 limit)
  private messageIds: Map<string, number> = new Map(); // ID -> timestamp
  private readonly MAX_MESSAGE_IDS = 1000;

  private hasSeenMessage(msgId: string): boolean {
    return this.messageIds.has(msgId);
  }

  private recordMessage(msgId: string): void {
    // Bump to top (update timestamp for liveliness)
    this.messageIds.set(msgId, Date.now());

    // Purge old entries if over limit
    if (this.messageIds.size > this.MAX_MESSAGE_IDS) {
      const sorted = Array.from(this.messageIds.entries())
        .sort((a, b) => a[1] - b[1]);
      const toRemove = sorted.slice(0, sorted.length - this.MAX_MESSAGE_IDS);
      toRemove.forEach(([id]) => this.messageIds.delete(id));
    }
  }

  private validateMessage(data: any): boolean {
    // Validate GunDB message format
    if (!data || typeof data !== 'object') return false;
    // Must have message ID for protocol compliance
    if (!data['#']) return false;
    // Additional validation as needed
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    const id = crypto.randomUUID();

    this.connections.set(id, server);
    server.accept();

    server.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);

        // Validate message format (prevent invalid writes)
        if (!this.validateMessage(data)) {
          console.warn('Invalid message format, rejecting');
          return;
        }

        const msgId = data['#'];

        // GunDB protocol: Check if we've seen this message
        if (this.hasSeenMessage(msgId)) {
          // Already seen - bump priority and don't rebroadcast
          this.recordMessage(msgId);
          return; // Prevent rebroadcast storm
        }

        // New message - record it
        this.recordMessage(msgId);

        // Broadcast to all other peers
        this.connections.forEach((ws, peerId) => {
          if (peerId !== id) {
            // Validate before sending (prevent corrupted data)
            if (this.validateMessage(data)) {
              ws.send(event.data);
            }
          }
        });
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });

    server.addEventListener('close', () => {
      this.connections.delete(id);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
```

### Wrangler Config

```toml
name = "gundb-relay"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "RELAY"
class_name = "Relay"
script_name = "gundb-relay"
```

## Related

- TICKET-001: Architecture (relay reference)
- TICKET-003: GunDB integration (uses relay)
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- GunDB Mesh Network Protocol: https://zwhitchcox.github.io/gun/more-about-gun/the-mesh-network-protocol.html