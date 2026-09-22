/**
 * Utility functions to clear local Holster storage
 *
 * Holster stores graph data in IndexedDB under the database name configured
 * via its `opt.file` (gunService.storageDbName: 'radata_dev' in dev mode,
 * 'radata' in production, or a `config.file` override). It does NOT use
 * localStorage or sessionStorage for graph data.
 *
 * Deleting the database is IMPOSSIBLE while Holster's connection is open —
 * the library never closes it and registers no `versionchange` handler — and
 * it is open for the whole life of the app once gunService.initialize() runs.
 * clearHolsterStorage() therefore records a pending clear in localStorage and
 * asks for a reload; completePendingStorageClear() performs the deletion
 * before Holster initializes on the next load, when nothing holds a
 * connection.
 */

import { useAuthStore } from '@/stores/authStore';
import { gunService } from '@/services/gunService';

/** localStorage key holding the DB name to delete on the next startup. */
const PENDING_CLEAR_KEY = 'holster.storageClearPending';

/**
 * Outcome of a clear request. `deferred` means an open connection (this
 * page's Holster instance or another tab) blocked deletion, so nothing was
 * deleted and a reload is required.
 */
export type StorageClearOutcome =
  | 'deleted'
  | 'deferred'
  | 'error'
  | 'unavailable';

/**
 * Issue a single deleteDatabase request and classify the outcome. A retry
 * is deliberately absent: while Holster holds its connection open the
 * request is always `blocked`, and on a fresh page load the previous page's
 * connection is already gone, so a single attempt is sufficient.
 */
function deleteStorageDatabase(
  dbName: string
): Promise<'deleted' | 'blocked' | 'error'> {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => {
      console.log(`✅ Deleted IndexedDB database: ${dbName}`);
      resolve('deleted');
    };
    request.onerror = () => {
      // deleteDatabase on a non-existent database fires onsuccess, so
      // onerror is a genuine failure: the database was NOT deleted.
      const reason = request.error?.message ?? 'unknown error';
      console.warn(
        `⚠️ Failed to delete IndexedDB database ${dbName} (${reason}) — ` +
          `it was NOT deleted.`
      );
      resolve('error');
    };
    request.onblocked = () => resolve('blocked');
  });
}

/**
 * Clear all Holster data from IndexedDB
 *
 * This function:
 * - Logs out the current user if authenticated
 * - Deletes Holster's IndexedDB database if nothing holds it open
 * - Otherwise records a pending clear and asks for a reload (the deletion
 *   cannot happen in-page; see the file header)
 *
 * @param options - Options for clearing
 * @param options.logout - Whether to logout the current user (default: true)
 * @returns Outcome of the clear: 'deleted' (done), 'deferred' (a reload is
 *   required to complete it), 'error', or 'unavailable' (no IndexedDB)
 */
export async function clearHolsterStorage(
  options: { logout?: boolean } = {}
): Promise<StorageClearOutcome> {
  const { logout = true } = options;

  console.log('🧹 Clearing local Holster storage...');

  // Logout current user if authenticated
  if (logout) {
    try {
      const authStore = useAuthStore.getState();
      if (authStore.isAuthenticated) {
        await authStore.logout();
        console.log('✅ Logged out current user');
      }
    } catch (error) {
      console.warn('⚠️ Error during logout:', error);
    }
  }

  if (typeof indexedDB === 'undefined') {
    console.log('✅ No IndexedDB in this environment; nothing to clear');
    return 'unavailable';
  }

  const dbName = gunService.storageDbName;
  const outcome = await deleteStorageDatabase(dbName);

  if (outcome === 'deleted') {
    console.log('✅ Local Holster storage cleared successfully');
    return 'deleted';
  }

  if (outcome === 'blocked') {
    localStorage.setItem(PENDING_CLEAR_KEY, dbName);
    console.warn(
      `⚠️ IndexedDB database ${dbName} is held open by this ` +
        `page's Holster instance (Holster never closes its connection), ` +
        `so it could not be deleted now. A clear is PENDING — reload the ` +
        `page to complete it (deletion runs before Holster starts).`
    );
    return 'deferred';
  }

  console.warn(
    '❌ Local Holster storage was NOT cleared — see the error above.'
  );
  return 'error';
}

/**
 * Run any clear requested by clearHolsterStorage() on a previous load.
 *
 * MUST be called before gunService.initialize() opens a connection,
 * otherwise the deletion is blocked again.
 */
export async function completePendingStorageClear(): Promise<void> {
  const dbName = localStorage.getItem(PENDING_CLEAR_KEY);
  if (!dbName) return;

  if (typeof indexedDB === 'undefined') {
    localStorage.removeItem(PENDING_CLEAR_KEY);
    console.log(
      '✅ No IndexedDB in this environment; discarded pending storage clear'
    );
    return;
  }

  console.log(
    `🧹 Completing pending clear of IndexedDB database "${dbName}"...`
  );

  const outcome = await deleteStorageDatabase(dbName);

  if (outcome === 'deleted') {
    localStorage.removeItem(PENDING_CLEAR_KEY);
    console.log(
      '✅ Pending clear complete — storage is empty for this session'
    );
    return;
  }

  // Keep the flag so the next reload retries.
  console.warn(
    `⚠️ Pending clear of "${dbName}" FAILED (${outcome}). ` +
      `Close other tabs of this app and reload to retry.`
  );
}
