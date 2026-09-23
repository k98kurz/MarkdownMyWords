import readmeContent from '../../readme.md?raw';
import { MarkdownPreview } from './MarkdownPreview';

export function ReadmePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold text-card-foreground">
        Readme
      </h1>
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <MarkdownPreview content={readmeContent} />
      </div>
    </div>
  );
}
