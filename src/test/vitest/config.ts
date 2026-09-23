/**
 * Shared configuration for the non-browser vitest run.
 *
 * The relay host/port are shared by the global setup (which starts the relay)
 * and the per-file setup (which points holsterService at it), so the two always
 * agree without passing values between the main and worker processes.
 *
 * The host is pinned to IPv4 loopback: the test relay binds loopback only, and
 * resolving `localhost` can yield `::1` first, which would be refused.
 */

export const TEST_RELAY_HOST = '127.0.0.1';

export const TEST_RELAY_PORT = Number(process.env.MMW_TEST_RELAY_PORT ?? 8787);

export const TEST_RELAY_URL = `ws://${TEST_RELAY_HOST}:${TEST_RELAY_PORT}`;
