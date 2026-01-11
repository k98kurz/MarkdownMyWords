# Discussion

## Architecture Decisions

### Why GunDB?

GunDB provides true decentralization - users host their own data. This aligns with the goal of a free, privacy-focused tool. The peer-to-peer sync enables collaboration without a central server.

### Why PBKDF2 instead of GunDB's SEA?

While GunDB has SEA (Security, Encryption, Authorization), using PBKDF2 gives us more control over the key derivation process and allows us to use username + password directly, which may be more intuitive for users.

### Why OpenRouter instead of direct API calls?

OpenRouter provides a unified interface to multiple LLM providers, giving users choice and potentially better pricing. Client-side integration keeps the app free (no proxy costs).

### Why Cloudflare Workers for Relay?

Cloudflare Workers free tier is generous (100k requests/day), and it's simple to deploy. The relay is optional but helps with peer discovery and connectivity.

## Open Questions

1. **Monaco vs CodeMirror**: Which editor provides better markdown editing experience?
   - Monaco: More features, larger bundle
   - CodeMirror: Lighter, more customizable

2. **State Management**: Zustand vs Jotai?
   - Zustand: Simpler, more popular
   - Jotai: More atomic, better for complex state

3. **Encryption Library**: crypto-js vs Web Crypto API?
   - crypto-js: Easier to use, larger bundle
   - Web Crypto API: Native, smaller bundle, async

4. **Sharing Model**: How granular should permissions be?
   - Simple: Public/Private
   - Complex: User-specific, role-based

5. **Conflict Resolution**: What strategy for concurrent edits?
   - Last-write-wins (simplest)
   - Operational transforms (complex)
   - CRDTs (middle ground)

## Notes

- Consider adding export to markdown files as backup mechanism
- May need to implement document versioning for conflict resolution
- Consider adding document templates
- Think about search functionality - client-side only
- Consider adding tags/categories for document organization
