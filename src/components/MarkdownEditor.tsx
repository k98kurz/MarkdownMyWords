import { useEffect, useRef } from 'react';
import {
  EditorView,
  lineNumbers,
  drawSelection,
  dropCursor,
  keymap,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import {
  defaultKeymap,
  indentWithTab,
  history,
  historyKeymap,
} from '@codemirror/commands';
import { classHighlighter } from '@lezer/highlight';
import { syntaxHighlighting } from '@codemirror/language';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  onSave?: () => void;
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  onSave,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      lineNumbers(),
      drawSelection(),
      dropCursor(),
      markdown(),
      syntaxHighlighting(classHighlighter),
      EditorView.lineWrapping,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    ];

    if (onSave) {
      extensions.push(
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current?.();
              return true;
            },
          },
        ])
      );
    }

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
