/**
 * Type-safe utilities for working with Holster SEA encryption.
 */

import type { ISEAPair, SEACipher } from '@/types/holster';

export type { ISEAPair };

/**
 * Type guard for SEA cipher objects ({ct, iv, s} with base64 fields).
 *
 * Values read back from Holster nodes may carry extra graph metadata
 * (e.g. `_`) alongside the cipher fields; that is harmless because
 * SEA.decrypt only reads ct/iv/s.
 */
export function isSEACipher(value: unknown): value is SEACipher {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ct' in value &&
    'iv' in value &&
    's' in value
  );
}

/**
 * Extract SEA keypair from a Holster user node.
 *
 * Holster stores the key pair directly on the session state (user.is) after
 * auth() — there is no user._.sea like GunDB. The session shape
 * {username, pub, epub, priv, epriv} matches ISEAPair.
 */
export function getUserSEA(user: unknown): ISEAPair | undefined {
  if (
    user &&
    typeof user === 'object' &&
    'is' in user &&
    user.is &&
    typeof user.is === 'object' &&
    'priv' in user.is &&
    'epriv' in user.is &&
    user.is.priv &&
    user.is.epriv
  ) {
    return user.is as ISEAPair;
  }
  return undefined;
}
