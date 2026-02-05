import { useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';

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

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
          {onTitleChange ? (
            <input
              type="text"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-lg font-medium text-card-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
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
            <div className="ml-4 flex gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-background text-card-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-card-foreground'
                }`}
                onClick={() => handleViewChange('edit')}
              >
                Edit
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-background text-card-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-card-foreground'
                }`}
                onClick={() => handleViewChange('preview')}
              >
                Preview
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'split'
                    ? 'bg-background text-card-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-card-foreground'
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
          <div className="h-full w-full overflow-auto">
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              readOnly={isReadOnly}
            />
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="h-full w-full overflow-auto p-6">
            <MarkdownPreview content={content} />
          </div>
        )}

        {viewMode === 'split' && (
          <>
            <div className="h-full w-1/2 overflow-auto border-r border-border">
              <MarkdownEditor
                value={content}
                onChange={onContentChange}
                readOnly={isReadOnly}
              />
            </div>
            <div className="h-full w-1/2 overflow-auto p-6">
              <MarkdownPreview content={content} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
