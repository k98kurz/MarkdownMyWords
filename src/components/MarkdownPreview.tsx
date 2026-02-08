import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from './MermaidDiagram';
import { useMemo } from 'react';
import { hashString } from '@/lib/cache';

interface MarkdownPreviewProps {
  content: string;
}

interface ContentSegment {
  type: 'markdown' | 'mermaid';
  content: string;
  key: string;
}

function parseMarkdownSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  let match;

  while ((match = mermaidRegex.exec(content)) !== null) {
    const [fullMatch, mermaidCode] = match;
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      segments.push({
        type: 'markdown',
        content: content.slice(lastIndex, matchIndex),
        key: `md-${segments.length}`,
      });
    }

    segments.push({
      type: 'mermaid',
      content: mermaidCode.trim(),
      key: `mermaid-${hashString(mermaidCode.trim())}`,
    });

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'markdown',
      content: content.slice(lastIndex),
      key: `md-${segments.length}`,
    });
  }

  return segments;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const segments = useMemo(() => parseMarkdownSegments(content), [content]);

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {segments.map(segment =>
        segment.type === 'mermaid' ? (
          <MermaidDiagram key={segment.key} code={segment.content} />
        ) : (
          <ReactMarkdown
            key={segment.key}
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { className, children, ...rest } = props;
                return (
                  <code className={className} {...rest}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {segment.content}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}
