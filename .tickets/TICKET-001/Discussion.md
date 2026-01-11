# Discussion

## Architecture Decisions

### Why GunDB?

GunDB provides true decentralization - users host their own data. This aligns with the goal of a free, privacy-focused tool. The peer-to-peer sync enables collaboration without a central server.

### Why GunDB's SEA?

GunDB's SEA (Security, Encryption, Authorization) provides built-in end-to-end encryption with ECDH key exchange for sharing. We use SEA as the primary encryption method for all operations. Manual PBKDF2/AES-256-GCM is only used as a fallback where SEA cannot support specific features (e.g., document-specific keys for the branching model).

### Why OpenRouter instead of direct API calls?

OpenRouter provides a unified interface to multiple LLM providers, giving users choice and potentially better pricing. Client-side integration keeps the app free (no proxy costs).

### Why Cloudflare Workers for Relay?

Cloudflare Workers free tier is generous (100k requests/day), and it's simple to deploy. The relay is optional but helps with peer discovery and connectivity.

## Open Questions

1. **Monaco vs CodeMirror**: ✅ **RESOLVED** - CodeMirror 6
   - **Decision**: CodeMirror 6 for markdown editing
   - **Rationale**:
     - Lighter bundle size (~200KB vs ~2MB for Monaco)
     - Better markdown support with plugins
     - More customizable and easier to style
     - Simpler implementation
     - Better performance for markdown editing
   - **Reference**: See Technology_Choices.md

2. **State Management**: ✅ **RESOLVED** - Zustand
   - **Decision**: Zustand for global state management
   - **Rationale**:
     - Simpler than Jotai (lower learning curve)
     - Smaller bundle size (~2.8KB vs ~4.2KB)
     - Better performance than Context API (selective re-renders)
     - Can access state outside React components (needed for GunDB subscriptions)
     - No provider boilerplate needed
   - **Reference**: See Technology_Choices.md and State_Management.md

3. **Encryption Library**: ✅ **RESOLVED** - Web Crypto API
   - **Decision**: Native Web Crypto API for encryption
   - **Rationale**:
     - Zero bundle size (native browser API)
     - Better performance (native, hardware-accelerated)
     - Better security (modern defaults)
     - Aligns with bundle size optimization goals
   - **Note**: Manual PBKDF2/AES-256-GCM via Web Crypto API used as fallback where GunDB SEA cannot support specific features
   - **Reference**: See Technology_Choices.md and Encryption_Architecture.md

4. **Sharing Model**: How granular should permissions be?
   - Simple: Public/Private
   - Complex: User-specific, role-based

5. **Conflict Resolution**: ✅ **RESOLVED** - Dual strategy
   - **Single-user multi-device**: Last-write-wins with timestamps
     - When the same user account edits a document from multiple devices
     - Simple and fast, no manual intervention needed
   - **Shared documents (multiple contributors)**: Git branching model
     - Each collaborator creates a branch for their proposed changes
     - Document owner reviews and merges branches via dedicated merge UI
     - Provides clear ownership and review process
     - Similar to pull request workflow in Git

## Notes

- Consider adding export to markdown files as backup mechanism
- **Conflict Resolution**:
  - Single-user multi-device: Last-write-wins (automatic, timestamp-based)
  - Shared documents: Git branching model (manual merge by owner)
    - Each collaborator creates a branch for their proposed changes
    - Owner reviews and merges branches via merge UI
    - Branches track full document state, not just diffs
- Consider adding document templates
- Think about search functionality - client-side only
- Consider adding tags/categories for document organization
