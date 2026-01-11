# [TICKET-006] Markdown Editor Component

## Metadata
- **Status**: ready
- **Complexity**: task_list
- **Service(s)**: frontend
- **Created**: 2026-01-11
- **Estimate**: 8h
- **Depends on**: TICKET-002

## Request

Implement the markdown editor component using CodeMirror 6 with syntax highlighting and a preview pane.

### User Story

As a user, I want a markdown editor with syntax highlighting and live preview so that I can write and edit markdown documents effectively.

### Requirements

1. **Editor Component**
   - CodeMirror 6 integration
   - Markdown syntax highlighting
   - Line numbers
   - Word wrap toggle
   - Font size adjustment

2. **Preview Component**
   - react-markdown integration
   - Rendered markdown display
   - Code syntax highlighting
   - Scroll sync (in split view)

3. **Editor Modes**
   - Edit mode (editor only)
   - Preview mode (preview only)
   - Split mode (both side-by-side)

4. **Toolbar**
   - Formatting buttons (bold, italic, headings)
   - Insert markdown syntax
   - Find & replace

5. **Document Styling Settings**
   - Text alignment controls (left, center, right, justify)
   - Line spacing controls
   - Apply styling to preview and export
   - Store styling (prefer embedded in Markdown if feasible, otherwise separate GunDB field)
   - Styling UI controls in editor toolbar or settings panel

## Acceptance Criteria

- [ ] CodeMirror editor integrated
- [ ] Markdown syntax highlighting working
- [ ] Preview component rendering markdown
- [ ] Three view modes working (edit/preview/split)
- [ ] Toolbar with formatting buttons
- [ ] Scroll sync in split view
- [ ] Theme support (light/dark)
- [ ] Responsive design
- [ ] Performance acceptable for large documents
- [ ] Document styling settings (text alignment, line spacing)
- [ ] Styling applied to preview and export
- [ ] Styling persisted (embedded or separate field)

## Technical Notes

### CodeMirror Setup

```typescript
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
```

### Preview Setup

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
```

### Document Styling

Styling options:
1. **Embedded in Markdown** (preferred if feasible)
   - Use frontmatter YAML or HTML comments
   - Examples: Pandoc-style metadata, Marked.js extensions
   - Pros: Self-contained documents, portable
   - Cons: May require custom parsing

2. **Separate GunDB Field** (fallback)
   - Store styling in document metadata node
   - Apply via CSS classes or inline styles in preview
   - Pros: Cleaner markdown, easier to implement
   - Cons: Requires separate storage, less portable

Key styling properties:
- Text alignment: `text-align` (left, center, right, justify)
- Line spacing: `line-height` (1.0, 1.5, 2.0, etc.)

## Related

- TICKET-002: Project setup (dependencies)
- TICKET-010: Theme system (for editor themes)
