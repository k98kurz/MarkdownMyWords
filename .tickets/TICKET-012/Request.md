# [TICKET-012] Cloudflare Pages Deployment

## Metadata
- **Status**: ready
- **Complexity**: simple
- **Service(s)**: infrastructure
- **Created**: 2026-01-11
- **Estimate**: 2h
- **Depends on**: TICKET-002, TICKET-011

## Request

Deploy the React application to Cloudflare Pages with automatic deployments from Git.

### User Story

As a developer, I want the application deployed to Cloudflare Pages so that users can access it online.

### Requirements

1. **Cloudflare Pages Setup**
   - Connect GitHub repository
   - Configure build settings
   - Set environment variables
   - Configure custom domain (optional)

2. **Build Configuration**
   - Vite build command
   - Output directory
   - Node version
   - Build optimization

3. **Deployment**
   - Initial deployment
   - Automatic deployments from Git
   - Branch previews
   - Deployment status

4. **Configuration**
   - Environment variables
   - Headers (security, CORS)
   - Redirects (if needed)

## Acceptance Criteria

- [x] Cloudflare Pages account already exists
- [ ] Repository connected
- [ ] Build configuration working
- [ ] Application deployed successfully
- [ ] Automatic deployments working
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Security headers configured
- [ ] Application accessible online

## Technical Notes

### Build Settings

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18.x
- Environment variables: `RELAY_URL`

### Security Headers

Configure via `_headers` file in `public/` directory (copied to `dist/` during build):

```
/*
  Content-Security-Policy: default-src 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
```

## Related

- TICKET-002: Project setup (build configuration)
- TICKET-011: Relay server (for RELAY_URL)
- Cloudflare Pages: https://developers.cloudflare.com/pages/
