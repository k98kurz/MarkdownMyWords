# Task List

## Relay Server

- [ ] Create relay server code
- [ ] Implement WebSocket handling
- [ ] Implement GunDB mesh network protocol
- [ ] Implement message ID deduplication (1,000 cache limit)
- [ ] Implement message validation (prevent invalid writes)
- [ ] Implement data validation on read (prevent corrupted data)
- [ ] Implement message relay with protocol compliance
- [ ] Handle ACK messages (reply-to fields)
- [ ] Add error handling
- [ ] Add CORS headers
- [ ] Test locally with GunDB client

## Cloudflare Setup

- [ ] Create Cloudflare Workers account
- [ ] Install Wrangler CLI
- [ ] Configure Wrangler
- [ ] Set up project structure
- [ ] Configure environment variables

## Deployment

- [ ] Deploy to Cloudflare Workers
- [ ] Test WebSocket connections
- [ ] Verify message relay (protocol compliance)
- [ ] Test message deduplication
- [ ] Test with GunDB client library
- [ ] Verify no rebroadcast storms
- [ ] Test message validation
- [ ] Monitor for errors

## Documentation

- [ ] Document relay URL
- [ ] Document deployment process
- [ ] Document configuration
- [ ] Update architecture docs
