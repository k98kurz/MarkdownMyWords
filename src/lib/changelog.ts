import changelogContent from '@/changelog.md?raw';

export function getChangelogTitle(): string {
  const lines = changelogContent.split('\n');
  if (lines.length === 0) return 'Changelog';

  const firstLine = lines[0];
  return `Release Notes: ${firstLine.replace(/^#+\s*/, '').trim()}`;
}

export function getChangelogContent(): string {
  return changelogContent;
}
