# Deployment Architecture

## Overview

MarkdownMyWords is deployed as a static site on Cloudflare Pages with a GunDB relay server on Cloudflare Workers. The architecture is designed to be free, scalable, and require minimal maintenance.

## Infrastructure Components

### 1. Cloudflare Pages (Static Hosting)

**Purpose**: Host the React application

**Configuration**:
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: 18.x
- Environment variables: None required (all client-side)

**Deployment**:
- Automatic deployment from Git
- Branch previews for PRs
- Production deployment from main branch

**Features**:
- Global CDN
- Automatic HTTPS
- Custom domains
- Analytics (optional)

**Cost**: Free tier sufficient

### 2. Cloudflare Workers (Relay Server)

**Purpose**: GunDB relay server for peer discovery

**Implementation**:
```javascript
// Simple WebSocket relay
export default {
  async fetch(request, env) {
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request);
    }
    return new Response('GunDB Relay', { status: 200 });
  }
};
```

**Configuration**:
- Runtime: V8 isolates
- Memory: 128MB (default)
- CPU time: 50ms (free tier)

**Deployment**:
- Wrangler CLI
- GitHub Actions (optional)

**Cost**: Free tier (100k requests/day)

## Deployment Process

### Initial Setup

1. **Cloudflare Pages**
   ```bash
   # Connect GitHub repository
   # Configure build settings
   # Deploy
   ```

2. **Cloudflare Workers**
   ```bash
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

### Continuous Deployment

**GitHub Actions Workflow**:
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-pages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: markdownmywords

  deploy-workers:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## Build Configuration

### Vite Configuration

```typescript
// vite.config.ts
export default {
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'editor': ['@codemirror/view', '@codemirror/state'],
          'gun': ['gun']
        }
      }
    }
  },
  define: {
    'process.env.RELAY_URL': JSON.stringify(process.env.RELAY_URL)
  }
};
```

### Environment Variables

**Build Time**:
- `RELAY_URL`: GunDB relay WebSocket URL

**Runtime**:
- None required (all configuration in code)

## Domain Configuration

### Custom Domain

1. Add domain in Cloudflare Pages
2. Configure DNS records
3. SSL certificate auto-provisioned

### Subdomain

- `app.markdownmywords.com` (example)
- Automatic HTTPS
- CDN caching

## CDN & Caching

### Static Assets

- **Cache Control**: Long-term caching
- **Versioning**: Content-based hashing
- **Compression**: Gzip/Brotli

### HTML

- **Cache Control**: No cache (always fresh)
- **Revalidation**: Stale-while-revalidate

## Monitoring & Logging

### Cloudflare Analytics

- Page views
- Bandwidth usage
- Request analytics

### Error Tracking

- Browser console errors
- User reports
- Future: Sentry integration

## Scaling Considerations

### Current Limits

- **Pages**: Unlimited (free tier)
- **Workers**: 100k requests/day (free tier)
- **Bandwidth**: 500MB/day (free tier)

### Scaling Path

1. **Free Tier**: Sufficient for MVP
2. **Paid Tier**: If needed for higher traffic
3. **Enterprise**: For large-scale deployment

## Backup & Recovery

### Data Backup

- User data in GunDB (decentralized)
- No central backup needed
- Export functionality for users

### Code Backup

- Git repository
- Cloudflare Pages deployments
- Version history

## Security Headers

### Cloudflare Pages Headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

## Performance Optimization

### Build Optimizations

- Code splitting
- Tree shaking
- Minification
- Compression

### Runtime Optimizations

- CDN caching
- Edge computing
- Lazy loading
- Service workers (future)

## Deployment Checklist

- [ ] Cloudflare Pages account created
- [ ] Cloudflare Workers account created
- [ ] GitHub repository connected
- [ ] Build configuration tested
- [ ] Relay server deployed
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Environment variables set
- [ ] Monitoring configured
- [ ] Error tracking set up (optional)
