# Discussion

## Cloudflare Pages

### Benefits
- Free tier generous
- Fast global CDN
- Automatic HTTPS
- Easy Git integration
- Branch previews

### Build Process
- Automatic on Git push
- Builds in Cloudflare
- Deploys to CDN
- Fast deployment

## Environment Variables

- RELAY_URL: GunDB relay WebSocket URL
- Set in Cloudflare dashboard
- Available at build time
- Can be different per environment

## Custom Domain

- Optional but recommended
- Easy to configure
- Automatic SSL
- Professional appearance

## Security

- Security headers configured via `_headers` file in `public/` directory
- File is automatically copied to `dist/` during build
- HTTPS enforced automatically by Cloudflare
- CSP headers configured
- No sensitive data in build
