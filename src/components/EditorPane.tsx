import { useState, useEffect } from 'react';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { useAppWidth } from '@/contexts/AppWidthContext';
import { usePreferences } from '@/providers/PreferenceProvider';

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
  onSave?: () => void;
  onDownload?: () => void;
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
  onSave,
  onDownload,
}: EditorPaneProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const { setAppWidth } = useAppWidth();
  const { editorPreferences } = usePreferences();

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
    <div className="flex h-full flex-col overflow-visible">
      {showHeader && (
        <div className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between overflow-visible">
          <div className="flex flex-1 items-center gap-2">
            {onTitleChange ? (
              <input
                type="text"
                className="flex-1 rounded-md border border-border-20 bg-background px-3 py-2 text-lg font-medium text-card-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={title}
                onChange={e => onTitleChange(e.target.value)}
                placeholder="Document title"
              />
            ) : (
              <h3 className="flex-1 text-lg font-medium text-card-foreground">
                {title}
              </h3>
            )}
            {onDownload && (
              <button
                type="button"
                className="group relative rounded-md border border-border-20 bg-background-5 p-2 text-foreground-70 hover:bg-foreground-10 hover:text-foreground-90 transition-colors"
                onClick={onDownload}
                title="Download"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs text-white group-hover:block whitespace-nowrap">
                  Download
                </span>
              </button>
            )}
          </div>

          {enableViewSwitch && (
            <div className="ml-4 flex gap-1 rounded-md bg-background-5 p-1 w-full md:w-auto md:ml-4">
              <button
                type="button"
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors md:flex-none ${
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
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors md:flex-none ${
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
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors md:flex-none ${
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
              onSave={onSave}
              syntaxHighlightingEnabled={
                editorPreferences.syntaxHighlightingEnabled
              }
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
                onSave={onSave}
                syntaxHighlightingEnabled={
                  editorPreferences.syntaxHighlightingEnabled
                }
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
