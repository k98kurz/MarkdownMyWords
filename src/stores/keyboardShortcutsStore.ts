import { create } from 'zustand';

type ShortcutKey = string;

export type ShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'preventDefault'
>;

interface ShortcutEntry {
  key: ShortcutKey;
  owner: string;
  description: string;
  handler: () => void;
  priority: number;
}

interface KeyboardShortcutsState {
  shortcuts: Map<ShortcutKey, ShortcutEntry[]>;
  registerShortcut: (
    key: ShortcutKey,
    owner: string,
    description: string,
    handler: () => void,
    priority?: number
  ) => void;
  unregisterShortcut: (key: ShortcutKey, owner: string) => void;
  handleEvent: (event: ShortcutEvent) => boolean;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>(
  (set, get) => ({
    shortcuts: new Map(),

    registerShortcut: (
      key: ShortcutKey,
      owner: string,
      description: string,
      handler: () => void,
      priority = 0
    ) => {
      set(state => {
        const newShortcuts = new Map(state.shortcuts);
        const existing = newShortcuts.get(key) ?? [];
        const entry: ShortcutEntry = {
          key,
          owner,
          description,
          handler,
          priority,
        };
        const index = existing.findIndex(e => e.owner === owner);
        if (index >= 0) {
          const next = [...existing];
          next[index] = entry;
          newShortcuts.set(key, next);
        } else {
          newShortcuts.set(key, [...existing, entry]);
        }
        return { shortcuts: newShortcuts };
      });
    },

    unregisterShortcut: (key: ShortcutKey, owner: string) => {
      set(state => {
        const newShortcuts = new Map(state.shortcuts);
        const existing = newShortcuts.get(key);
        if (existing) {
          const next = existing.filter(e => e.owner !== owner);
          if (next.length === 0) {
            newShortcuts.delete(key);
          } else {
            newShortcuts.set(key, next);
          }
        }
        return { shortcuts: newShortcuts };
      });
    },

    handleEvent: (event: ShortcutEvent): boolean => {
      const { shortcuts } = get();

      if (typeof event.key !== 'string' || event.key.length === 0) {
        return false;
      }

      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push('ctrl');
      if (event.metaKey) modifiers.push('meta');
      if (event.altKey) modifiers.push('alt');
      if (event.shiftKey) modifiers.push('shift');

      const shortcutKey = [...modifiers, event.key.toLowerCase()].join('+');

      const entries = shortcuts.get(shortcutKey);
      if (!entries || entries.length === 0) {
        return false;
      }

      let winner = entries[0];
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].priority >= winner.priority) {
          winner = entries[i];
        }
      }

      event.preventDefault();
      winner.handler();
      return true;
    },
  })
);
