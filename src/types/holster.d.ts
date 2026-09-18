/**
 * TypeScript declarations for @mblaney/holster.
 *
 * Holster doesn't publish type definitions, so we provide minimal declarations here.
 * The actual types are defined in src/types/gun.ts.
 */

/**
 * SEA Instance type
 */
interface SEAInstance {
  encrypt(
    data: unknown,
    pair: { epriv: string } | string
  ): Promise<string>;
  decrypt<T = unknown>(
    message: string,
    pair: { epriv: string } | string
  ): Promise<T>;
  secret(
    key: string | { epub: string },
    pair: { epriv: string; epub: string }
  ): Promise<string | undefined>;
  pair(): Promise<{ epriv: string; epub: string; priv: string; pub: string }>;
  work(
    data: unknown,
    salt?: unknown,
    callback?: unknown
  ): Promise<string | undefined>;
  sign(
    data: unknown,
    pair: { priv: string; pub: string }
  ): Promise<string>;
  verify<T = unknown>(
    message: string,
    pair: string | { pub: string }
  ): Promise<T>;
}

/**
 * GunDB/Holster Constructor type
 */
interface GunConstructor {
  (options?: Record<string, unknown>): unknown;
  SEA: SEAInstance;
}

declare module '@mblaney/holster/src/holster.js' {
  const holster: GunConstructor;
  export default holster;
}