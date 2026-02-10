import { EditorPane } from './EditorPane';

interface EditorAreaProps {
  docId?: string;
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  onTitleChange: (title: string) => void;
  enableViewSwitch?: boolean;
  defaultViewMode?: 'edit' | 'preview' | 'split';
  isReadOnly?: boolean;
  onSave?: () => void;
}

export function EditorArea({
  title,
  content,
  onContentChange,
  onTitleChange,
  enableViewSwitch = true,
  defaultViewMode = 'edit',
  isReadOnly = false,
  onSave,
}: EditorAreaProps) {
  return (
    <div className="flex h-full w-full flex-col">
      <EditorPane
        title={title}
        content={content}
        onContentChange={onContentChange}
        onTitleChange={onTitleChange}
        enableViewSwitch={enableViewSwitch}
        defaultViewMode={defaultViewMode}
        isReadOnly={isReadOnly}
        onSave={onSave}
      />
    </div>
  );
}
