import { useEffect, useRef } from 'react';
import {
  EditorView,
  lineNumbers,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      lineNumbers(),
      drawSelection(),
      dropCursor(),
      markdown(),
      EditorView.lineWrapping,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewRef.current) {
      const currentState = viewRef.current.state.doc.toString();
      if (currentState !== value) {
        const transaction = viewRef.current.state.update({
          changes: {
            from: 0,
            to: currentState.length,
            insert: value,
          },
        });
        viewRef.current.dispatch(transaction);
      }
    }
  }, [value]);

  return <div className="h-full w-full" ref={containerRef} />;
}
