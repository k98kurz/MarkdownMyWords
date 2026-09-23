/**
 * Test Setup
 *
 * The suite runs non-browser (vitest `environment: 'node'`). Holster detects
 * Node and uses its filesystem store, so IndexedDB is not needed, but
 * localStorage/sessionStorage (relay settings and `user().store()`/`recall()`)
 * and a reachable relay are. The relay is provisioned by `globalSetup.ts`;
 * this file supplies the storage shims and points the app at that relay.
 *
 * Runs before test modules are imported, so the globals exist by the time
 * `holsterService` reads them.
 */

import { afterEach } from 'vitest';
import { TEST_RELAY_URL } from '@/test/vitest/config';

/** Minimal in-memory Storage for the Node test environment. */
function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
}

if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createMemoryStorage(),
    configurable: true,
  });
}

// Never let a test run talk to the configured default (or production) relay.
localStorage.setItem('relaySettings', JSON.stringify([TEST_RELAY_URL]));

// React Testing Library cleanup, only meaningful in a DOM environment.
if (typeof document !== 'undefined') {
  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  });
}
