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
    <div className="editor-pane">
      {showHeader && (
        <div className="pane-header">
          {onTitleChange ? (
            <input
              type="text"
              className="pane-title-input"
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Document title"
            />
          ) : (
            <h3 className="pane-title">{title}</h3>
          )}

          {enableViewSwitch && (
            <div className="view-switcher">
              <button
                type="button"
                className={`view-button ${viewMode === 'edit' ? 'active' : ''}`}
                onClick={() => handleViewChange('edit')}
              >
                Edit
              </button>
              <button
                type="button"
                className={`view-button ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => handleViewChange('preview')}
              >
                Preview
              </button>
              <button
                type="button"
                className={`view-button ${viewMode === 'split' ? 'active' : ''}`}
                onClick={() => handleViewChange('split')}
              >
                Both
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`pane-content pane-content--${viewMode}`}>
        {viewMode === 'edit' && (
          <div className="view-pane view-pane--edit">
            <MarkdownEditor
              value={content}
              onChange={onContentChange}
              readOnly={isReadOnly}
            />
          </div>
        )}

        {viewMode === 'preview' && (
          <div className="view-pane view-pane--preview">
            <MarkdownPreview content={content} />
          </div>
        )}

        {viewMode === 'split' && (
          <>
            <div className="split-pane split-pane--left">
              <MarkdownEditor
                value={content}
                onChange={onContentChange}
                readOnly={isReadOnly}
              />
            </div>
            <div className="split-pane split-pane--right">
              <MarkdownPreview content={content} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
