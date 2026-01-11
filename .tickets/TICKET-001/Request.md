# [TICKET-001] Project Architecture and Implementation Planning

## Metadata
- **Status**: done
- **Complexity**: plan
- **Service(s)**: frontend, backend, infrastructure
- **Created**: 2026-01-11
- **Estimate**: 8h

## Request

Architect and plan the complete MarkdownMyWords application using a decentralized, peer-to-peer architecture. This ticket will produce a comprehensive architecture document and break down the work into implementable tickets.

### User Story

As a developer, I want a complete architectural plan for MarkdownMyWords so that I can build a decentralized writing tool with offline-first capabilities, real-time collaboration, and AI-powered features.

### Requirements

1. **Technology Stack**
   - React frontend framework
   - GunDB for decentralized, peer-to-peer database
   - Cloudflare Pages for static site hosting
   - Cloudflare Workers for GunDB relay server
   - End-to-end encryption using GunDB's SEA (Security, Encryption, Authorization)
   - OpenRouter API for LLM integration (client-side)

2. **Core Features**
   - Syntax-highlighted Markdown editor
   - Document management and storage
   - Per-document sharing settings
   - AI-powered review and revision (via OpenRouter)
   - Dark mode and light mode UI themes

3. **UI/UX Requirements**
   - Main content area on the left (editor/preview)
   - Sidebar on the right with:
     - AI features panel
     - Sharing settings panel
   - Responsive design
   - Theme switching (dark/light mode)

4. **Security & Privacy**
   - End-to-end encryption for all documents (GunDB SEA)
   - SEA-based authentication and key management
   - Encrypted data storage in GunDB
   - Secure sharing with ECDH-based key exchange

5. **Infrastructure**
   - Static site deployment on Cloudflare Pages
   - GunDB relay server via Cloudflare Workers
   - No backend database required
   - Fully decentralized architecture

## Acceptance Criteria

- [x] Complete architecture document created
- [x] Technology stack decisions documented with rationale
- [x] Data model and GunDB schema designed
- [x] Security architecture documented (encryption, key management)
- [x] UI/UX wireframes or mockups created
- [x] Implementation plan broken down into discrete tickets
- [x] Dependencies between tickets identified
- [x] Risk assessment completed
- [x] Performance considerations documented
- [x] Deployment strategy documented

## Technical Notes

### Key Architectural Decisions

1. **GunDB Relay**: A simple relay server will be deployed on Cloudflare Workers to help with peer discovery and initial connections. This is optional - users can also connect directly via WebRTC.

2. **Encryption**: GunDB's SEA will be used as the primary encryption method, providing automatic encryption/decryption and ECDH-based sharing. Manual AES-256-GCM is only used as a fallback for document-specific keys needed for the branching model.

3. **OpenRouter Integration**: Client-side integration means users will need to provide their own OpenRouter API key. This keeps the application free and avoids proxying costs.

4. **Sharing Model**: Each document will have sharing settings that control:
   - Public/private visibility
   - Read/write permissions
   - Shareable links
   - User-specific access control

### Constraints

- Must work as a static site (no server-side rendering)
- Must function offline (with sync when online)
- Must be free to host (Cloudflare free tier)
- Must respect user privacy (decentralized, encrypted)

## Related

- GunDB Documentation: https://gun.js.org/
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- OpenRouter API: https://openrouter.ai/docs
- GunDB SEA Documentation: https://gun.eco/docs/SEA
