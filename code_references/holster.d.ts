/**
 * HISTORICAL REFERENCE — preserved as-is; do not import, extend, or use as
 * a reference for new code.
 *
 * This is the ambient declaration file that lived at src/types/holster.d.ts
 * during the GunDB → Holster migration, paired with
 * code_references/testNewGunSEAScheme.ts — the browser dev tool that was
 * used to reverse-engineer and validate the old GunDB SEA scheme.
 *
 * It documents the LEGACY GunDB string-based SEA system:
 * - encrypt returned a plain string; decrypt took a plain string
 * - keys could be bare strings (no {epriv} key object required)
 * - secret() accepted a bare epub string
 * - work() returned the derived hash string directly
 * - failures surfaced as undefined
 *
 * Holster's actual SEA behaves differently: {epriv} key objects, {ct, iv, s}
 * cipher objects, and null failure sentinels — see src/types/gun.ts and
 * docs/memory.md ("Holster SEA Object Shapes").
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