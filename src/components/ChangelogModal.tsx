import { Modal } from './ui/Modal';
import { MarkdownPreview } from './MarkdownPreview';
import { getChangelogContent } from '@/lib/changelog';

export function ChangelogModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const content = getChangelogContent();

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl">
        <div className="p-6">
          <h2 className="mb-6 text-xl font-semibold text-card-foreground">
            Changelog
          </h2>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownPreview content={content} />
          </div>
        </div>
      </Modal>
    </>
  );
}
