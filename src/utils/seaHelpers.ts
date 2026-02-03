/**
 * SEA Helper Utilities
 *
 * Type-safe utilities for working with GunDB SEA encryption.
 */

import type { ISEAPair } from 'gun/types';

/**
 * Extract SEA keypair from GunDB user node
 * Type-safe without using 'as any'
 */
export function getUserSEA(user: unknown): ISEAPair | undefined {
  if (
    user &&
    typeof user === 'object' &&
    '_' in user &&
    user._ &&
    typeof user._ === 'object' &&
    'sea' in user._
  ) {
    return user._.sea as ISEAPair;
  }
  return undefined;
}
