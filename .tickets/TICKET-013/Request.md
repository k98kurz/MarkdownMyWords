# [TICKET-013] Standalone Relay/Mirror Server

## Metadata
- **Status**: ready
- **Complexity**: task_list
- **Service(s)**: backend, infrastructure
- **Created**: 2026-01-11
- **Estimate**: 8h

## Request

Create a standalone, headless GunDB relay/mirror server that users can run to keep copies of their own data (or data of users they want to mirror) and make it more available to the network.

### User Story

As a user, I want to run a standalone relay/mirror server so that I can ensure my data (or data I want to mirror) is always available, even when my devices are offline.

### Requirements

1. **Standalone Server**
   - Headless/backend-only implementation
   - No UI or frontend components
   - Runs as a persistent service
   - GunDB peer with persistent storage
   - Acts as both relay and mirror

2. **Operation Modes**
   - **Whitelist mode**: Only mirror/relay data for specified users
   - **Blacklist mode**: Mirror/relay data for all users except specified ones
   - Configurable via configuration file

3. **Configuration**
   - Operation mode (whitelist/blacklist)
   - Bootstrap relay nodes (list of relay URLs to connect to)
   - Whitelist/blacklist of usernames
   - Whitelist/blacklist of certificates (public keys)
   - Storage location/path
   - Port configuration
   - Logging configuration

4. **Data Mirroring**
   - Store data locally (persistent storage)
   - Mirror data for configured users
   - Sync with network peers
   - Maintain data availability when users are offline

5. **Relay Functionality**
   - Relay messages between peers
   - Help with peer discovery
   - NAT traversal assistance

## Acceptance Criteria

- [ ] Standalone server implementation (Node.js)
- [ ] Configuration file system
- [ ] Operation mode support (whitelist/blacklist)
- [ ] Username filtering (whitelist/blacklist)
- [ ] Certificate filtering (whitelist/blacklist)
- [ ] Bootstrap relay node configuration
- [ ] Persistent data storage
- [ ] Data mirroring for configured users
- [ ] Relay functionality
- [ ] Logging system
- [ ] Documentation created
- [ ] Deployment instructions

## Technical Notes

### Server Implementation

```typescript
// Standalone GunDB server
import Gun from 'gun';
import { readConfig } from './config';

const config = readConfig();
const gun = Gun({
  peers: config.bootstrapRelays,
  file: config.storagePath,
  radisk: true
});

// Filter data based on operation mode
gun.on('out', (data) => {
  if (!shouldRelay(data, config)) {
    return; // Don't relay
  }
  // Relay data
});
```

### Configuration File Format

```json
{
  "operationMode": "whitelist",
  "bootstrapRelays": [
    "wss://relay.markdownmywords.com/gun"
  ],
  "whitelist": {
    "usernames": ["user1", "user2"],
    "certificates": ["pubkey1", "pubkey2"]
  },
  "blacklist": {
    "usernames": [],
    "certificates": []
  },
  "storage": {
    "path": "./data",
    "radisk": true
  },
  "server": {
    "port": 8765,
    "webSocket": true
  },
  "logging": {
    "level": "info",
    "file": "./logs/server.log"
  }
}
```

**Note**: Both `whitelist` and `blacklist` sections should be present in the config file, but only the one matching `operationMode` will be used. The other can be empty arrays.

### Filtering Logic

```typescript
function shouldRelay(data: any, config: Config): boolean {
  if (config.operationMode === 'whitelist') {
    return isInWhitelist(data, config.whitelist);
  } else {
    return !isInBlacklist(data, config.blacklist);
  }
}
```

## Related

- TICKET-001: Architecture (relay/mirror reference)
- TICKET-011: Cloudflare Workers Relay (public relay)
- GunDB Documentation: https://gun.js.org/
