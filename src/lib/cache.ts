export function hashString(code: string): number {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

export class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();

  constructor(private maxItems: number) {}

  private generateKey(code: string): string {
    return hashString(code).toString(36);
  }

  get(key: string): T | undefined {
    const hashKey = this.generateKey(key);
    const entry = this.cache.get(hashKey);
    if (entry) {
      this.cache.delete(hashKey);
      this.cache.set(hashKey, { ...entry, timestamp: Date.now() });
      return entry.value;
    }
    return undefined;
  }

  set(code: string, value: T): void {
    const key = this.generateKey(code);
    this.cache.delete(key);
    this.cache.set(key, { value, timestamp: Date.now() });

    if (this.cache.size > this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const mermaidCache = new LRUCache<string>(20);
