/**
 * Utility functions to clear local GunDB storage
 *
 * GunDB stores data in:
 * - localStorage (keys prefixed with "gun/")
 * - IndexedDB (via radisk)
 * - sessionStorage (for session/auth data)
 */

import { useAuthStore } from '../stores/authStore';

/**
 * Clear all GunDB data from local storage
 * This includes:
 * - localStorage items with "gun/" prefix
 * - IndexedDB databases used by GunDB/radisk
 * - sessionStorage items
 *
 * @param options - Options for clearing
 * @param options.logout - Whether to logout the current user (default: true)
 * @param options.clearIndexedDB - Whether to clear IndexedDB (default: true)
 * @param options.clearLocalStorage - Whether to clear localStorage (default: true)
 * @param options.clearSessionStorage - Whether to clear sessionStorage (default: true)
 * @returns Promise that resolves when clearing is complete
 */
export async function clearGunDBLocalStorage(options: {
  logout?: boolean;
  clearIndexedDB?: boolean;
  clearLocalStorage?: boolean;
  clearSessionStorage?: boolean;
} = {}): Promise<void> {
  const {
    logout = true,
    clearIndexedDB = true,
    clearLocalStorage = true,
    clearSessionStorage = true,
  } = options;

  console.log('🧹 Clearing local GunDB storage...');

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

  // Clear localStorage items with "gun/" prefix
  if (clearLocalStorage && typeof localStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gun/')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    console.log(`✅ Cleared ${keysToRemove.length} localStorage items`);
  }

  // Clear sessionStorage items
  if (clearSessionStorage && typeof sessionStorage !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('gun/') || key.includes('gun'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key);
    });
    console.log(`✅ Cleared ${keysToRemove.length} sessionStorage items`);
  }

  // Clear IndexedDB databases used by GunDB/radisk
  if (clearIndexedDB && typeof indexedDB !== 'undefined') {
    try {
      // GunDB/radisk typically uses databases with names like:
      // - "radata" (default radisk database)
      // - "gun" (sometimes used)
      // - Or custom names based on configuration

      const dbNames = ['radata', 'gun', 'radisk'];
      const deletePromises: Promise<void>[] = [];

      for (const dbName of dbNames) {
        deletePromises.push(
          new Promise<void>((resolve) => {
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
              console.warn(`⚠️ IndexedDB database ${dbName} is blocked, may need page reload`);
              resolve();
            };
          })
        );
      }

      await Promise.all(deletePromises);
    } catch (error) {
      console.warn('⚠️ Error clearing IndexedDB:', error);
    }
  }

  console.log('✅ Local GunDB storage cleared successfully');
  console.log('💡 You may need to reload the page for changes to take full effect');
}

