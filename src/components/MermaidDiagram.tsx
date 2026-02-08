import { useEffect, useState, memo } from 'react';
import mermaid from 'mermaid';
import { useDebounce } from '@/hooks/useDebounce';
import { mermaidCache } from '@/lib/cache';

interface MermaidDiagramProps {
  code: string;
}

export const MermaidDiagram = memo(function MermaidDiagram({
  code,
}: MermaidDiagramProps) {
  const trimmedCode = code.trim();
  const [displaySvg, setDisplaySvg] = useState(() => {
    const cached = mermaidCache.get(trimmedCode);
    return cached ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const [id] = useState(
    () => `mermaid-${Math.random().toString(36).slice(2, 11)}`
  );

  const debouncedCode = useDebounce(trimmedCode, 400);

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      if (!debouncedCode) {
        return;
      }

      const cachedSvg = mermaidCache.get(debouncedCode);
      if (cachedSvg && isMounted) {
        setDisplaySvg(cachedSvg);
        setError(null);
        return;
      }

      try {
        await mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'strict',
        });

        const { svg: renderedSvg } = await mermaid.render(id, debouncedCode);

        if (isMounted) {
          setDisplaySvg(renderedSvg);
          setError(null);
          mermaidCache.set(debouncedCode, renderedSvg);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to render diagram'
          );
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [debouncedCode, id]);

  if (error) {
    return (
      <div className="my-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">Mermaid Error</p>
        <p className="text-xs text-destructive/80">{error}</p>
      </div>
    );
  }

  if (!displaySvg) {
    return (
      <div className="my-4 flex min-h-[200px] items-center justify-center rounded-lg bg-muted/20">
        <svg
          className="h-8 w-8 animate-spin text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative my-4">
      <div
        className="flex justify-center"
        dangerouslySetInnerHTML={{ __html: displaySvg }}
      />
    </div>
  );
});
