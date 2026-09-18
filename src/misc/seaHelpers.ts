/**
 * Type-safe utilities for working with Holster SEA encryption.
 */

import type { ISEAPair } from '@/types/gun';

export type { ISEAPair };

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
