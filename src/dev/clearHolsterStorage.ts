/**
 * Utility functions to clear local Holster storage
 *
 * Holster stores data only in IndexedDB with database name "radata".
 * It does NOT use localStorage or sessionStorage for graph data.
 */

import { useAuthStore } from '@/stores/authStore';

/**
 * Clear all Holster data from IndexedDB
 *
 * This function:
 * - Logs out the current user if authenticated
 * - Deletes the "radata" IndexedDB database (Holster's graph storage)
 *
 * @param options - Options for clearing
 * @param options.logout - Whether to logout the current user (default: true)
 * @returns Promise that resolves when clearing is complete
 */
export async function clearHolsterStorage(
  options: { logout?: boolean } = {}
): Promise<void> {
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

  // Clear Holster's IndexedDB database
  if (typeof indexedDB !== 'undefined') {
    try {
      // Holster uses only "radata" as its IndexedDB database
      const dbName = 'radata';

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => {
          console.log(`✅ Deleted IndexedDB database: ${dbName}`);
          resolve();
        };
        deleteRequest.onerror = () => {
          // deleteDatabase on a non-existent database fires onsuccess, so
          // onerror is a genuine failure: the database was NOT deleted.
          const reason = deleteRequest.error?.message ?? 'unknown error';
          console.warn(
            `⚠️ Failed to delete IndexedDB database ${dbName} ` +
              `(${reason}) — it was NOT deleted. Resolve the underlying ` +
              `error and retry.`
          );
          reject(new Error(`deleteDatabase('${dbName}') failed: ${reason}`));
        };
        deleteRequest.onblocked = () => {
          // Blocked means the database was NOT deleted: an open connection
          // (this page's Holster instance or another tab) is holding it.
          // Resolving here would falsely report success.
          console.warn(
            `⚠️ IndexedDB database ${dbName} is BLOCKED by an open ` +
              `connection — it was NOT deleted. This app's own Holster ` +
              `instance blocks deletion while it runs; close other tabs ` +
              `of this app and clear 'radata' via DevTools > Application ` +
              `> IndexedDB instead.`
          );
          reject(new Error(`deleteDatabase('${dbName}') blocked`));
        };
      });
    } catch (error) {
      console.warn('⚠️ IndexedDB clear FAILED:', error);
      console.log(
        '❌ Local Holster storage was NOT cleared — resolve the block ' +
          'above and retry.'
      );
      return;
    }
  }

  console.log('✅ Local Holster storage cleared successfully');
  console.log(
    '💡 You may need to reload the page for changes to take full effect'
  );
}