# Technology Choices & Rationale

## Frontend Framework

### React 18.0.0+

**Choice**: React with TypeScript

**Rationale**:
- Industry standard with large ecosystem
- Component-based architecture fits our UI needs
- Excellent TypeScript support
- Large community and resources
- Good performance with modern features (hooks, concurrent rendering)
- Works well with static site generation (Cloudflare Pages)

**Alternatives Considered**:
- Vue.js: Smaller ecosystem, less TypeScript support
- Svelte: Smaller ecosystem, newer framework
- Vanilla JS: Too much boilerplate, no component system

## State Management

### Zustand (Recommended)

**Choice**: Zustand for global state management

**Rationale**:
- Simpler than Redux (less boilerplate)
- Smaller bundle size (~1KB)
- Excellent TypeScript support
- No providers needed (simpler setup)
- Good performance
- Easy to learn and use

**Alternatives Considered**:
- **Jotai**: Atomic state management, more complex for our needs
- **Redux**: Too much boilerplate, overkill for this project
- **Context API**: Performance issues with frequent updates

**Usage**:
- Global state: User authentication, current document, theme
- Document state: Current document content, metadata
- UI state: Sidebar visibility, editor mode

## Markdown Editor

### CodeMirror 6 (Recommended)

**Choice**: CodeMirror 6 for markdown editing

**Rationale**:
- Lighter than Monaco Editor (~200KB vs ~2MB)
- Excellent markdown support with plugins
- Highly customizable
- Good TypeScript support
- Better performance for markdown editing
- Active development and community

**Alternatives Considered**:
- **Monaco Editor**: Too large, designed for code editing
- **SimpleMDE**: Deprecated, no longer maintained
- **react-markdown-editor**: Less customizable

**Features Needed**:
- Syntax highlighting
- Line numbers
- Word wrap
- Find & replace
- Keyboard shortcuts

## Markdown Rendering

### react-markdown

**Choice**: react-markdown for rendering markdown to HTML

**Rationale**:
- Secure by default (no XSS vulnerabilities)
- Extensible with remark/rehype plugins
- Good performance
- Active maintenance
- TypeScript support

**Plugins**:
- `remark-gfm`: GitHub Flavored Markdown support
- `remark-math`: Math equation support (optional)
- `rehype-highlight`: Code syntax highlighting
- `rehype-raw`: HTML in markdown (optional, security consideration)

## Database

### GunDB 0.2020.x

**Choice**: GunDB for decentralized, peer-to-peer database

**Rationale**:
- True decentralization (no central server)
- Peer-to-peer sync
- Works offline
- Graph database model fits our data structure
- Free and open source
- Good for collaborative applications

**Alternatives Considered**:
- **Firebase**: Centralized, requires backend
- **Supabase**: Centralized, requires backend
- **IPFS**: More complex, not designed for real-time sync

**Storage**:
- Browser: IndexedDB (via GunDB)
- Relay: Cloudflare Workers (optional)

## Encryption

### Web Crypto API

**Choice**: Native Web Crypto API for encryption

**Rationale**:
- Native browser API (no dependencies)
- Smaller bundle size (no crypto-js needed)
- Better performance (native implementation)
- Secure by default
- Modern and well-supported

**Algorithms**:
- **PBKDF2**: Key derivation from password
- **AES-256-GCM**: Document encryption
- **RSA-OAEP**: Key encryption for sharing

**Alternatives Considered**:
- **crypto-js**: Larger bundle, easier API but less secure defaults
- **libsodium.js**: More features but larger bundle

## Build Tool

### Vite

**Choice**: Vite for build tooling

**Rationale**:
- Fast development server (HMR)
- Fast builds
- Modern tooling (ES modules)
- Good TypeScript support
- Simple configuration
- Works well with React

**Alternatives Considered**:
- **Create React App**: Slower, deprecated
- **Next.js**: Overkill for static site
- **Webpack**: More complex configuration

## Type Checking

### TypeScript

**Choice**: TypeScript for type safety

**Rationale**:
- Catches errors at compile time
- Better IDE support
- Self-documenting code
- Refactoring safety
- Industry standard

**Configuration**:
- Strict mode enabled
- ES2020 target
- Module: ESNext

## Styling

### CSS Modules + CSS Variables

**Choice**: CSS Modules with CSS Variables for theming

**Rationale**:
- Scoped styles (no conflicts)
- CSS Variables for theme switching
- No runtime overhead
- Simple and performant
- Good TypeScript support

**Alternatives Considered**:
- **Tailwind CSS**: Larger bundle, learning curve
- **Styled Components**: Runtime overhead, larger bundle
- **Sass/SCSS**: Additional dependency

**Theme System**:
- CSS variables for colors
- Data attribute for theme switching (`data-theme="dark"`)

## HTTP Client

### Fetch API

**Choice**: Native Fetch API for HTTP requests

**Rationale**:
- Native browser API (no dependencies)
- Modern and well-supported
- Promise-based
- Smaller bundle

**Alternatives Considered**:
- **Axios**: Additional dependency, larger bundle
- **Superagent**: Additional dependency

## LLM Integration

### OpenRouter API + Ollama

**Choice**: OpenRouter for cloud-based LLM access, Ollama for local/self-hosted LLM access

**Rationale**:
- **OpenRouter**: Unified API for multiple LLM providers, user provides own API key (no proxy costs), good pricing, active development, simple REST API
- **Ollama**: Complete privacy (data never leaves device), no API costs, works offline, supports multiple open-source models, aligns with decentralized architecture
- Provider abstraction allows users to choose based on privacy/cost preferences
- Both use similar API patterns, making integration straightforward

**Models**:
- **OpenRouter**: GPT-4 for high-quality reviews, GPT-3.5 Turbo for suggestions (cost-effective), Claude as alternative
- **Ollama**: llama2, mistral, codellama, and any user-installed models

**Architecture**:
- Provider abstraction layer
- Factory pattern for service creation
- Unified interface for both providers
- Provider-specific configuration stored encrypted

## Hosting

### Cloudflare Pages

**Choice**: Cloudflare Pages for static site hosting

**Rationale**:
- Free tier is generous
- Fast global CDN
- Automatic deployments from Git
- Simple setup
- Good performance
- No server management

**Alternatives Considered**:
- **Vercel**: Similar, but Cloudflare has better free tier
- **Netlify**: Similar, but Cloudflare has better performance
- **GitHub Pages**: Less features, slower

## Relay Server

### Cloudflare Workers

**Choice**: Cloudflare Workers for GunDB relay

**Rationale**:
- Free tier: 100k requests/day
- Fast edge computing
- Simple deployment
- No server management
- Good for WebSocket relay

**Implementation**:
- Simple WebSocket relay
- No data storage
- Helps with peer discovery

## Package Manager

### npm

**Choice**: npm for package management

**Rationale**:
- Comes with Node.js
- Widely used
- Good performance (npm 7+)
- Works well with all tools

**Alternatives Considered**:
- **pnpm**: Faster but less common
- **yarn**: Similar to npm, no significant advantage

## Code Quality

### ESLint + Prettier

**Choice**: ESLint for linting, Prettier for formatting

**Rationale**:
- Catches common errors
- Enforces code style
- Improves code quality
- Industry standard

**Configuration**:
- React plugin
- TypeScript plugin
- Accessibility plugin

## Testing (Future)

### Vitest

**Choice**: Vitest for unit testing (future)

**Rationale**:
- Fast (uses Vite)
- Good TypeScript support
- Jest-compatible API
- Works well with React Testing Library

**Note**: Testing not in initial scope, but planned for future

## Development Tools

### TypeScript
- Type safety
- Better IDE support

### ESLint
- Code quality
- Error prevention

### Prettier
- Code formatting
- Consistency

### Git
- Version control
- Collaboration

## Summary Table

| Category | Technology | Rationale |
|----------|-----------|-----------|
| Frontend | React 18 | Industry standard, large ecosystem |
| State | Zustand | Simple, small bundle, TypeScript support |
| Editor | CodeMirror 6 | Lightweight, markdown-focused |
| Rendering | react-markdown | Secure, extensible |
| Database | GunDB | Decentralized, P2P, offline-first |
| Encryption | Web Crypto API | Native, secure, no dependencies |
| Build | Vite | Fast, modern, simple |
| Types | TypeScript | Type safety, better DX |
| Styling | CSS Modules | Scoped, performant |
| HTTP | Fetch API | Native, no dependencies |
| LLM | OpenRouter + Ollama | Cloud (OpenRouter) and local (Ollama) options |
| Hosting | Cloudflare Pages | Free, fast, simple |
| Relay | Cloudflare Workers | Free tier, edge computing |

## Decision Criteria

All technology choices were evaluated based on:

1. **Bundle Size**: Smaller is better (faster load times)
2. **Performance**: Fast runtime performance
3. **Developer Experience**: Easy to use and maintain
4. **Community**: Active development and support
5. **TypeScript Support**: Good type definitions
6. **Cost**: Free or low-cost options preferred
7. **Security**: Secure by default
8. **Decentralization**: Aligns with project goals

## Future Considerations

- **Testing Framework**: Vitest when testing is added
- **E2E Testing**: Playwright or Cypress (future)
- **Monitoring**: Consider error tracking (Sentry, etc.)
- **Analytics**: Privacy-respecting analytics (optional)
- **PWA**: Service workers for offline support (future)
