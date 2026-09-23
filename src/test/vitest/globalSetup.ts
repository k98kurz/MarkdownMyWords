/**
 * Vitest global setup: provision the Holster relay the non-browser suite
 * talks to, so `npm test` needs no manual relay step.
 *
 * The relay runs as a child process with its storage rooted in a fresh temp
 * directory, so each run starts from an empty graph and never touches the dev
 * (`radata_dev`) or production (`radata`) stores. It binds loopback only, so
 * a test run does not expose a relay on the network.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { TEST_RELAY_HOST, TEST_RELAY_PORT } from './config';

const RELAY_SCRIPT = fileURLToPath(
  new URL('../../../holster-relay.js', import.meta.url)
);

const START_TIMEOUT_MS = 15_000;
/** Ceiling for graceful relay shutdown before the process is force-killed. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * True when a TCP server can bind the port on loopback. Run before spawning so
 * an occupied port fails immediately instead of silently connecting the tests
 * to whatever else is listening.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, TEST_RELAY_HOST);
  });
}

/** Resolve on connect, reject on refusal; a fresh socket per attempt. */
function connectOnce(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host: TEST_RELAY_HOST });
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', error => {
      socket.destroy();
      reject(error);
    });
  });
}

/**
 * Poll until the relay accepts connections. A refused connection means it has
 * not bound yet; a dead child means it never will, so fail immediately.
 */
async function waitForRelay(
  child: ChildProcess,
  port: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `relay exited before accepting connections ` +
          `(code ${child.exitCode}, signal ${child.signalCode})`
      );
    }
    try {
      await connectOnce(port);
      return;
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for ${TEST_RELAY_HOST}:${port}`);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  const relayDir = mkdtempSync(join(tmpdir(), 'mmw-test-relay-'));

  if (!(await isPortFree(TEST_RELAY_PORT))) {
    rmSync(relayDir, { recursive: true, force: true });
    throw new Error(
      `Port ${TEST_RELAY_PORT} is already in use; free it or set ` +
        `MMW_TEST_RELAY_PORT to another port.`
    );
  }

  const child: ChildProcess = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: relayDir,
    env: {
      ...process.env,
      GUN_PORT: String(TEST_RELAY_PORT),
      GUN_HOST: TEST_RELAY_HOST,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (data: Buffer) => (output += data.toString()));
  child.stderr?.on('data', (data: Buffer) => (output += data.toString()));

  try {
    await waitForRelay(child, TEST_RELAY_PORT, START_TIMEOUT_MS);
  } catch (error) {
    child.kill('SIGKILL');
    rmSync(relayDir, { recursive: true, force: true });
    throw new Error(
      `Failed to start test relay on ${TEST_RELAY_HOST}:${TEST_RELAY_PORT}: ` +
        `${String(error)}\n${output}`
    );
  }

  return async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve =>
        child.once('close', () => resolve())
      );
      child.kill('SIGTERM');
      const escalate = setTimeout(
        () => child.kill('SIGKILL'),
        SHUTDOWN_TIMEOUT_MS
      );
      await closed;
      clearTimeout(escalate);
    }
    rmSync(relayDir, { recursive: true, force: true });
  };
}
