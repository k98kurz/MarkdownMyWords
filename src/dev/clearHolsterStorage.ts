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

      await new Promise<void>((resolve) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => {
          console.log(`✅ Deleted IndexedDB database: ${dbName}`);
          resolve();
        };
        deleteRequest.onerror = () => {
          // Database might not exist, which is fine
          resolve();
        };
        deleteRequest.onblocked = () => {
          // Database is in use, try to close connections
          console.warn(
            `⚠️ IndexedDB database ${dbName} is blocked, may need page reload`
          );
          resolve();
        };
      });
    } catch (error) {
      console.warn('⚠️ Error clearing IndexedDB:', error);
    }
  }

  console.log('✅ Local Holster storage cleared successfully');
  console.log(
    '💡 You may need to reload the page for changes to take full effect'
  );
}