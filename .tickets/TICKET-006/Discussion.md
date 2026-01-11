# Discussion

## CodeMirror vs Monaco

### Why CodeMirror?
- Lighter bundle size (~200KB vs ~2MB)
- Better markdown support
- More customizable
- Good TypeScript support

## Editor Features

### Essential
- Syntax highlighting
- Line numbers
- Word wrap
- Basic formatting toolbar

### Nice to Have
- Find & replace
- Multiple cursors
- Code folding
- Minimap

## Performance

- CodeMirror handles large documents well
- Virtual scrolling for very long documents
- Debounce auto-save
- Lazy load preview

## Document Styling Approaches

### Embedded Styling Options

1. **Frontmatter YAML**
   ```yaml
   ---
   style:
     textAlign: justify
     lineHeight: 1.6
   ---
   ```
   - Pros: Standard, portable, readable
   - Cons: Requires frontmatter parser (gray-matter)

2. **HTML Comments**
   ```html
   <!-- style: text-align=justify; line-height=1.6 -->
   ```
   - Pros: Simple, doesn't affect rendering
   - Cons: Less standard, harder to parse

3. **Custom Markdown Extension**
   - Extend markdown syntax (e.g., `[style: align=justify]`)
   - Pros: Markdown-native
   - Cons: Requires custom parser, not portable

### Separate Field Approach

- Store in GunDB document node: `doc.styling = { textAlign, lineHeight }`
- Apply via CSS classes or inline styles
- Pros: Clean markdown, easy implementation
- Cons: Not portable, requires metadata storage

### Recommendation

Start with frontmatter YAML approach (most standard and portable). If parsing becomes complex, fall back to separate GunDB field.
