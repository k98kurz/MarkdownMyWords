import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownPreview } from '@/components/MarkdownPreview';

function render(content: string): string {
  return renderToStaticMarkup(<MarkdownPreview content={content} />);
}

describe('MarkdownPreview', () => {
  it('renders details/summary as live elements', () => {
    const html = render(`<details>
<summary>Click to expand</summary>

hidden content

</details>`);

    expect(html).toContain('<details>');
    expect(html).toContain('<summary>Click to expand</summary>');
    expect(html).toContain('hidden content');
    expect(html).not.toContain('&lt;details&gt;');
  });

  it('preserves the open attribute on details', () => {
    const html = render(`<details open>
<summary>Expanded</summary>

content

</details>`);

    expect(html).toContain('<details open="">');
  });

  it('renders inline HTML inside summary', () => {
    const html = render(`<details>
<summary><b>Bold</b> and <i>italic</i></summary>

body

</details>`);

    expect(html).toContain('<b>Bold</b>');
    expect(html).toContain('<i>italic</i>');
  });

  it('still produces KaTeX markup for math', () => {
    const html = render('Inline $x^2$ math.');

    expect(html).toContain('katex');
  });

  it('keeps footnote ref/backref anchors resolvable', () => {
    const html = render('Hello[^1]\n\n[^1]: note text\n');

    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
    const anchors = [...html.matchAll(/\shref="#([^"]+)"/g)].map(m => m[1]);

    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(ids).toContain(anchor);
    }
  });

  it('strips script tags, event handlers, and javascript: hrefs', () => {
    const html = render(`<details>
<summary>Test</summary>

<script>alert('xss')</script>
<img src="x" onerror="alert(1)">
<a href="javascript:alert(1)">click</a>
<iframe src="https://evil.com"></iframe>

</details>`);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<iframe>');
  });
});
