import { useState, KeyboardEvent, useEffect } from 'react';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 33;
const ERROR_DISMISS_MS = 5000;

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<{ message: string } | null>(null);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), ERROR_DISMISS_MS);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  const addTag = (newTag: string) => {
    const trimmed = newTag.trim();

    if (!trimmed) {
      return;
    }

    if (trimmed.length > MAX_TAG_LENGTH) {
      setError({ message: `Tag must be ${MAX_TAG_LENGTH} characters or less` });
      return;
    }

    if (tags.includes(trimmed)) {
      setError({ message: `Tag "${trimmed}" already exists` });
      setInputValue('');
      return;
    }

    if (tags.length >= MAX_TAGS) {
      setError({ message: `Maximum ${MAX_TAGS} tags allowed` });
      return;
    }

    const newTags = [...tags, trimmed].sort();
    onChange(newTags);
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
      setInputValue('');
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
    setInputValue('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Label htmlFor="doc-tags">
          Tags ({tags.length}/{MAX_TAGS}):
        </Label>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <Badge key={tag} variant="default" className="gap-1">
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:bg-rose-100 dark:hover:bg-rose-900 rounded-full p-0.5 transition-colors"
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Input
        id="doc-tags"
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={
          tags.length >= MAX_TAGS
            ? 'Maximum tags reached'
            : 'Type tag and press Enter'
        }
        disabled={tags.length >= MAX_TAGS}
      />

      {error && <div className="text-rose-500 text-sm">{error.message}</div>}
    </div>
  );
}
