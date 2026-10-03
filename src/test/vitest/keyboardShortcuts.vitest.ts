import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useKeyboardShortcutsStore } from '@/stores/keyboardShortcutsStore';

class MockKeyboardEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented = false;

  constructor(
    key: string,
    modifiers: {
      ctrl?: boolean;
      meta?: boolean;
      alt?: boolean;
      shift?: boolean;
    } = {}
  ) {
    this.key = key;
    this.ctrlKey = modifiers.ctrl ?? false;
    this.metaKey = modifiers.meta ?? false;
    this.altKey = modifiers.alt ?? false;
    this.shiftKey = modifiers.shift ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

function makeEvent(
  key: string,
  modifiers: {
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
    shift?: boolean;
  } = {}
): MockKeyboardEvent {
  return new MockKeyboardEvent(key, modifiers);
}

describe('keyboardShortcutsStore', () => {
  beforeEach(() => {
    useKeyboardShortcutsStore.setState({ shortcuts: new Map() });
  });

  it('priority winner fires regardless of registration order', () => {
    const lowHandler = vi.fn();
    const highHandler = vi.fn();

    const { registerShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'editor', 'Save', lowHandler, 0);
    registerShortcut('ctrl+s', 'modal', 'Apply', highHandler, 1);

    const event = makeEvent('s', { ctrl: true });
    const result = handleEvent(event);

    expect(result).toBe(true);
    expect(highHandler).toHaveBeenCalledTimes(1);
    expect(lowHandler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('same-owner re-register replaces the handler in place', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { registerShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'editor', 'Save', firstHandler, 0);
    registerShortcut('ctrl+s', 'editor', 'Save', secondHandler, 0);

    const event = makeEvent('s', { ctrl: true });
    handleEvent(event);

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("unregisterShortcut removes only that owner's binding", () => {
    const editorHandler = vi.fn();
    const modalHandler = vi.fn();

    const { registerShortcut, unregisterShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'editor', 'Save', editorHandler, 0);
    registerShortcut('ctrl+s', 'modal', 'Apply', modalHandler, 1);

    unregisterShortcut('ctrl+s', 'modal');

    const event = makeEvent('s', { ctrl: true });
    handleEvent(event);

    expect(modalHandler).not.toHaveBeenCalled();
    expect(editorHandler).toHaveBeenCalledTimes(1);
  });

  it('after the top entry is removed the next one fires', () => {
    const editorHandler = vi.fn();
    const modalHandler = vi.fn();

    const { registerShortcut, unregisterShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'editor', 'Save', editorHandler, 0);
    registerShortcut('ctrl+s', 'modal', 'Apply', modalHandler, 1);

    unregisterShortcut('ctrl+s', 'modal');

    const event = makeEvent('s', { ctrl: true });
    const result = handleEvent(event);

    expect(result).toBe(true);
    expect(editorHandler).toHaveBeenCalledTimes(1);
    expect(modalHandler).not.toHaveBeenCalled();
  });

  it('unknown key returns false and does not preventDefault', () => {
    const { handleEvent } = useKeyboardShortcutsStore.getState();

    const event = makeEvent('x', { ctrl: true });
    const result = handleEvent(event);

    expect(result).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('tie-break goes to the most recently registered entry', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { registerShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'editor', 'Save', firstHandler, 1);
    registerShortcut('ctrl+s', 'modal', 'Apply', secondHandler, 1);

    const event = makeEvent('s', { ctrl: true });
    handleEvent(event);

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it('priority wins when the higher-priority owner registers first', () => {
    const highHandler = vi.fn();
    const lowHandler = vi.fn();

    const { registerShortcut, handleEvent } =
      useKeyboardShortcutsStore.getState();

    registerShortcut('ctrl+s', 'modal', 'Apply', highHandler, 1);
    registerShortcut('ctrl+s', 'editor', 'Save', lowHandler, 0);

    const event = makeEvent('s', { ctrl: true });
    const result = handleEvent(event);

    expect(result).toBe(true);
    expect(highHandler).toHaveBeenCalledTimes(1);
    expect(lowHandler).not.toHaveBeenCalled();
  });
});
