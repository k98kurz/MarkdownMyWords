# MarkdownMyWords

A Free and Open Source Slopware project for local-first, collaborative document
writing with GunDB and OpenRouter for LLM-powered spell check, grammar, review,
revision, and proompt-based generation (if you really want that, but eww -- try
writing creatively for a change maybe?). Bring your own OpenRouter key for LLM
features.

## Status

- [x] Correct GunDB + SEA implementation
- [x] Basic document editing and rendering functionality
- [x] Basic privacy/encryption/sharing functionality
- [ ] Contact and notification system
- [ ] Advanced sharing with branches and merging
- [ ] Bring-your-own-key AI review/revise features

## Tech Stack

- Frontend Framework: React + React DOM
- Database: GunDB (peer-to-peer, decentralized)
- Security/Encryption/Auth: SEA (GunDB project)
- State Management: Zustand
- Routing: React Router DOM
- Editor: CodeMirror (@codemirror/state, @codemirror/view, @codemirror/lang-markdown)
- Markdown Rendering: React Markdown + Remark GFM (GitHub Flavored Markdown)
- Diagram Rendering: Mermaid
- Build Tool: Vite
- Language: TypeScript
- Styling: Tailwind CSS v3 (@tailwindcss/forms, @tailwindcss/typography)

## Development / Testing

```bash
git clone git@github.com:k98kurz/MarkdownMyWords.git
cd MarkdownMyWords
npm ci
cp dev.env .env
npm run dev # or `npm run dev:server` and `npm run dev:relay` in separate terminals
```

I had an impossible time with vitest, so all testing must be done in the browser.
I will need to rethink how I do testing at some point and come up with something
better.

## Hosting

- app.markdownmywords.com: Cloudflare Pages
- relay.markdownmywords.com: Railway

Railway was paradoxically much more difficult to get working -- I spent over an
hour trying different combinations of settings and script innards before I
discovered that Railway only pretends to support ports other than 80. If you want
to host a relay on Railway:
- Set `PORT=80` env var
- Build command `echo yes` (there's nothing to build)
- Watch file: railway-relay.js
- Start command: `npm run relay`

## Credits/Acknowledgements

This painful project would not have been possible without the GunDB devs and their
lackluster documentation, Gemini 3 Pro (which completely wrecked the project from
the outset), GLM-4.7 (which is okay until it gets to about 40% context window then
rots into gaslighting itself perpetually), and all the other little AIs I met
along the way.

Big thanks to Bram Moolenaar for creating vim, which is one of the most useful
development tools I use. I could not have unfucked this code or even used OpenCode
comfortably without vim.

## ISC License

Copyleft (c) 2026 Jonathan Voss (k98kurz) / The Pycelium Company

Permission to use, copy, modify, and/or distribute this software
for any purpose with or without fee is hereby granted, provided
that the above copyleft notice and this permission notice appear in
all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
