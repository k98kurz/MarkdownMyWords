/**
 * List Users Utility
 *
 * Function to list all users in the local GunDB database.
 * Exposed to browser console for debugging.
 */

import { gunService } from '../services/gunService';
import type { User } from '../types/gun';

/**
 * User Info Interface
 */
export interface UserInfo {
  userId: string;
  username?: string;
  createdAt?: number;
}

/**
 * List all users in the local GunDB database
 * @returns Promise resolving to array of user info
 */
export async function listUsers(): Promise<UserInfo[]> {
  const gun = gunService.getInstance();
  if (!gun) {
    throw new Error('GunDB not initialized');
  }

  return new Promise<UserInfo[]>((resolve, reject) => {
    const userMap = new Map<string, UserInfo>();
    const processedKeys = new Set<string>();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      // Query GunDB directly for user nodes in our namespace
      const userNamespace = gun.get('markdownmywords~user');

      // Use map to iterate through all users
      userNamespace.map().once((data: any, key: string) => {
        if (!data || !key) return;

        // Extract userId from key (format: markdownmywords~user~{userId})
        let userId = key;
        if (key.includes('~')) {
          const parts = key.split('~');
          userId = parts[parts.length - 1];
        }

        if (processedKeys.has(userId)) {
          return; // Skip if already processed
        }
        processedKeys.add(userId);

        const profile = data.profile || {};

        userMap.set(userId, {
          userId,
          username: profile.username,
          createdAt: profile.createdAt,
        });
      });

      // Wait a bit for all data to load, then resolve
      timeout = setTimeout(() => {
        resolve(Array.from(userMap.values()));
      }, 2000);
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * List users with detailed information (console-friendly format)
 * @returns Promise resolving to formatted user list
 */
export async function listUsersDetailed(): Promise<void> {
  try {
    const users = await listUsers();

    if (users.length === 0) {
      console.log('📭 No users found in local GunDB database');
      return;
    }

    console.log(`\n👥 Found ${users.length} user(s) in local GunDB:\n`);
    console.table(
      users.map((user) => ({
        'User ID': user.userId.length > 20 ? user.userId.substring(0, 20) + '...' : user.userId,
        'Username': user.username || '(no username)',
        'Created': user.createdAt
          ? new Date(user.createdAt).toLocaleString()
          : '(unknown)',
      }))
    );

    // Also log full user info
    console.log('\n📋 Full user details:');
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. User ID: ${user.userId}`);
      console.log(`   Username: ${user.username || '(no username)'}`);
      console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toISOString() : '(unknown)'}`);
    });

    return;
  } catch (error) {
    console.error('❌ Error listing users:', error);
    throw error;
  }
}

/**
 * Get a specific user by ID
 * @param userId - User ID to look up
 * @returns Promise resolving to user info or null if not found
 */
export async function getUserById(userId: string): Promise<UserInfo | null> {
  const gun = gunService.getInstance();
  if (!gun) {
    throw new Error('GunDB not initialized');
  }

  return new Promise<UserInfo | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, 5000);

    try {
      const userNode = gun.get(`markdownmywords~user~${userId}`);
      userNode.once((data: User | null) => {
        clearTimeout(timeout);

        if (!data || Object.keys(data).length === 0) {
          resolve(null);
          return;
        }

        const profile = data.profile || {};

        resolve({
          userId,
          username: profile.username,
        });
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
