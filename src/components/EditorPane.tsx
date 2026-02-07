import { useState, useEffect } from 'react';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { useAppWidth } from '@/contexts/AppWidthContext';

type ViewMode = 'edit' | 'preview' | 'split';

interface EditorPaneProps {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  onTitleChange?: (title: string) => void;
  showHeader?: boolean;
  enableViewSwitch?: boolean;
  defaultViewMode?: ViewMode;
  isReadOnly?: boolean;
}

export function EditorPane({
  title,
  content,
  onContentChange,
  onTitleChange,
  showHeader = true,
  enableViewSwitch = true,
  defaultViewMode = 'edit',
  isReadOnly = false,
}: EditorPaneProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const { setAppWidth } = useAppWidth();

  useEffect(() => {
    setAppWidth(viewMode === 'split' ? '100rem' : '80rem');

    return () => {
      setAppWidth('80rem');
    };
  }, [viewMode, setAppWidth]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between p-4">
          {onTitleChange ? (
            <input
              type="text"
              className="flex-1 rounded-md border border-border-20 bg-background px-3 py-2 text-lg font-medium text-card-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Document title"
            />
          ) : (
            <h3 className="text-lg font-medium text-card-foreground">
              {title}
            </h3>
          )}

          {enableViewSwitch && (
            <div className="ml-4 flex gap-1 rounded-md bg-background-5 p-1">
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-70 hover:text-foreground-90 hover:bg-foreground-10'
                }`}
                onClick={() => handleViewChange('edit')}
              >
                Edit
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-70 hover:text-foreground-90 hover:bg-foreground-10'
                }`}
                onClick={() => handleViewChange('preview')}
              >
                Preview
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground-70 hover:text-foreground-90 hover:bg-foreground-10'
                }`}
                onClick={() => handleViewChange('split')}
              >
                Both
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden bg-background">
        {viewMode === 'edit' && (
          <div className="h-full w-full overflow-auto scrollbar-thin">
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              readOnly={isReadOnly}
            />
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="h-full w-full overflow-auto p-6 scrollbar-thin">
            <MarkdownPreview content={content} />
          </div>
        )}

        {viewMode === 'split' && (
          <>
            <div className="h-full w-1/2 overflow-auto border-r border-border-20 scrollbar-thin">
              <MarkdownEditor
                value={content}
                onChange={onContentChange}
                readOnly={isReadOnly}
              />
            </div>
            <div className="h-full w-1/2 overflow-auto p-6 scrollbar-thin">
              <MarkdownPreview content={content} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
