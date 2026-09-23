/**
 * Vitest bridge for the existing browser-console suites.
 *
 * The suite functions in `src/test/*.test.ts` and `testDocumentSizes.ts` are
 * hand-rolled: each runs inside a `TestRunner` and returns a `TestSuiteResult`
 * with pass/fail counts rather than throwing. They stay the single source of
 * truth (and the `window.runAllTests()` browser path keeps working); this file
 * only initializes the services the way `main.tsx` does, calls the suites in
 * order, and fails the vitest run when any result reports failures.
 *
 * Non-browser provisions:
 * - Node's `process.versions.node` makes Holster's store use the filesystem,
 *   so a fresh temp dir per run isolates storage (no IndexedDB needed).
 * - localStorage/sessionStorage shims and the test relay URL live in
 *   `src/test/setup.ts`; the relay itself is started by `globalSetup.ts`.
 * - `crypto.subtle` is built into Node; WebSocket is supplied by Holster's
 *   own Node `ws` import.
 */

import { afterAll, beforeAll, test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { holsterService } from '@/services/holsterService';
import { encryptionService } from '@/services/encryptionService';
import { testVariousDocumentSizes } from '@/test/testDocumentSizes';
import { testHolsterService } from '@/test/holsterService.test';
import { testAuthStore } from '@/test/authStore.test';
import { testEncryptionService } from '@/test/encryptionService.test';
import { testDocumentStore } from '@/test/documentStore.test';
import type { TestSuiteResult } from '@/dev/testRunner';

let storageDir: string;

/** Collapse a suite's failed tests/tasks into readable failure lines. */
function failuresOf(suites: TestSuiteResult[]): string[] {
  return suites.flatMap(suite => [
    ...suite.tests
      .filter(test => !test.passed)
      .map(t => `[${suite.suiteName}] ${t.name}: ${t.error ?? 'failed'}`),
    ...suite.tasks
      .filter(task => !task.success)
      .map(t => `[${suite.suiteName}] ${t.name}: ${t.error ?? 'failed'}`),
  ]);
}

beforeAll(async () => {
  storageDir = mkdtempSync(join(tmpdir(), 'mmw-test-client-'));
  holsterService.initialize({ file: storageDir, indexedDB: false });
  const seaResult = await encryptionService.initializeSEA();
  if (!seaResult.success) {
    throw new Error(
      `SEA initialization failed: ${JSON.stringify(seaResult.error)}`
    );
  }
}, 60_000);

afterAll(() => {
  rmSync(storageDir, { recursive: true, force: true });
});

test('document encryption sizes', async () => {
  const failures = failuresOf([await testVariousDocumentSizes()]);
  expect(failures, 'document size suite failures').toEqual([]);
});

test('holster service', async () => {
  const failures = failuresOf(await testHolsterService());
  expect(failures, 'holster service suite failures').toEqual([]);
});

test('auth store', async () => {
  const failures = failuresOf([await testAuthStore()]);
  expect(failures, 'auth store suite failures').toEqual([]);
});

test('encryption service', async () => {
  const failures = failuresOf(await testEncryptionService());
  expect(failures, 'encryption service suite failures').toEqual([]);
});

test('document store', async () => {
  const failures = failuresOf(await testDocumentStore());
  expect(failures, 'document store suite failures').toEqual([]);
});
