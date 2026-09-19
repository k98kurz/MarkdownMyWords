/**
 * TypeScript declarations for @mblaney/holster.
 *
 * Holster doesn't publish type definitions, so we provide minimal declarations here.
 * The actual types are defined in src/types/gun.ts.
 *
 * WARNING: the SEAInstance below describes the LEGACY GunDB string-based SEA
 * API and does NOT match Holster's runtime behavior. Holster's SEA requires
 * {epriv} key objects, returns {ct, iv, s} cipher objects, and signals
 * failure with null (see src/types/gun.ts and docs/memory.md). These
 * declarations are kept only so the legacy dev tool
 * src/test/testNewGunSEAScheme.ts continues to compile — do NOT use them as
 * a reference for new code.
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