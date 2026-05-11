import { create } from 'zustand';

type ShortcutKey = string;

interface Shortcut {
  key: ShortcutKey;
  description: string;
  handler: () => void;
}

interface KeyboardShortcutsState {
  shortcuts: Map<ShortcutKey, Shortcut>;
  registerShortcut: (key: ShortcutKey, description: string, handler: () => void) => void;
  unregisterShortcut: (key: ShortcutKey) => void;
  handleEvent: (event: KeyboardEvent) => boolean;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>((set, get) => ({
  shortcuts: new Map(),

  registerShortcut: (key: ShortcutKey, description: string, handler: () => void) => {
    set(state => {
      const newShortcuts = new Map(state.shortcuts);
      newShortcuts.set(key, { key, description, handler });
      return { shortcuts: newShortcuts };
    });
  },

  unregisterShortcut: (key: ShortcutKey) => {
    set(state => {
      const newShortcuts = new Map(state.shortcuts);
      newShortcuts.delete(key);
      return { shortcuts: newShortcuts };
    });
  },

  handleEvent: (event: KeyboardEvent): boolean => {
    const { shortcuts } = get();

    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.metaKey) modifiers.push('meta');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');

    const shortcutKey = [...modifiers, event.key.toLowerCase()].join('+');

    const shortcut = shortcuts.get(shortcutKey);
    if (shortcut) {
      event.preventDefault();
      shortcut.handler();
      return true;
    }

    return false;
  },
}));
