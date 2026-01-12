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
  hasDocuments: boolean;
  documentCount: number;
}

/**
 * List all users in the local GunDB database
 * Includes both user profiles and SEA-authenticated users
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
      // Method 1: Check for currently authenticated SEA users
      const gunUser = gun.user();
      const userIs = gunUser.is as any;
      if (userIs && userIs.pub) {
        const userId = userIs.pub;
        const alias = userIs.alias || userIs.pub;

        if (!processedKeys.has(userId)) {
          processedKeys.add(userId);

          // Try to get user profile from our namespace
          gun.get(`markdownmywords~user~${userId}`).once((profileData: any) => {
            const profile = profileData?.profile || {};
            const documents = profileData?.documents || {};
            const documentKeys = Object.keys(documents).filter(
              (k) => k !== '_' && k !== '#' && documents[k] !== null && typeof documents[k] === 'object'
            );

            userMap.set(userId, {
              userId,
              username: profile.username || alias,
              createdAt: profile.createdAt,
              hasDocuments: documentKeys.length > 0,
              documentCount: documentKeys.length,
            });
          });

          // Also add immediately with alias as username if no profile found
          setTimeout(() => {
            if (!userMap.has(userId)) {
              userMap.set(userId, {
                userId,
                username: alias !== userId ? alias : undefined,
                createdAt: undefined,
                hasDocuments: false,
                documentCount: 0,
              });
            }
          }, 1000);
        }
      }

      // Method 2: Access GunDB's internal graph (most reliable for local data)
      const gunInternal = gun as any;
      const graph = gunInternal._?.graph || gunInternal.graph || {};

      // Iterate through the graph to find user nodes
      Object.keys(graph).forEach((key) => {
        // Check if this key matches the user pattern: markdownmywords~user~{userId}
        if (key.startsWith('markdownmywords~user~')) {
          const userId = key.replace('markdownmywords~user~', '');

          if (processedKeys.has(userId)) {
            return; // Skip if already processed
          }
          processedKeys.add(userId);

          const nodeData = graph[key];

          if (nodeData && typeof nodeData === 'object') {
            // Get user data from the node
            const userData = nodeData as any;
            const profile = userData.profile || {};
            const documents = userData.documents || {};

            // Count documents (exclude internal keys)
            const documentKeys = Object.keys(documents).filter(
              (k) => k !== '_' && k !== '#' && documents[k] !== null && typeof documents[k] === 'object'
            );

            userMap.set(userId, {
              userId,
              username: profile.username,
              createdAt: profile.createdAt,
              hasDocuments: documentKeys.length > 0,
              documentCount: documentKeys.length,
            });
          }
        }
      });

      // Method 3: Query GunDB directly for user nodes in our namespace
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
        const documents = data.documents || {};
        const documentKeys = Object.keys(documents).filter(
          (k) => k !== '_' && k !== '#' && documents[k] !== null && typeof documents[k] === 'object'
        );

        userMap.set(userId, {
          userId,
          username: profile.username,
          createdAt: profile.createdAt,
          hasDocuments: documentKeys.length > 0,
          documentCount: documentKeys.length,
        });
      });

      // Method 4: Check GunDB's user storage (SEA users are stored here)
      // GunDB stores SEA users under ~@alias or in the user graph
      const userGraph = (gunInternal._?.user || {}) as any;
      if (userGraph) {
        // Check for aliases in user graph
        Object.keys(userGraph).forEach((key) => {
          if (key.startsWith('~@')) {
            const alias = key.replace('~@', '');
            const userData = userGraph[key];
            if (userData && userData.pub) {
              const userId = userData.pub;
              if (!processedKeys.has(userId)) {
                processedKeys.add(userId);

                // Check if we already have this user with a profile
                if (!userMap.has(userId)) {
                  userMap.set(userId, {
                    userId,
                    username: alias,
                    createdAt: undefined,
                    hasDocuments: false,
                    documentCount: 0,
                  });
                } else {
                  // Update existing entry with alias if no username
                  const existing = userMap.get(userId);
                  if (existing && !existing.username) {
                    existing.username = alias;
                  }
                }
              }
            }
          }
        });
      }

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
        'Documents': user.documentCount,
        'Has Docs': user.hasDocuments ? '✅' : '❌',
      }))
    );

    // Also log full user info
    console.log('\n📋 Full user details:');
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. User ID: ${user.userId}`);
      console.log(`   Username: ${user.username || '(no username)'}`);
      console.log(`   Created: ${user.createdAt ? new Date(user.createdAt).toISOString() : '(unknown)'}`);
      console.log(`   Documents: ${user.documentCount}`);
    });

    return;
  } catch (error) {
    console.error('❌ Error listing users:', error);
    throw error;
  }
}

/**
 * List SEA-authenticated users (users currently or previously authenticated)
 * @returns Promise resolving to array of SEA user info
 */
export async function listSEAUsers(): Promise<UserInfo[]> {
  const gun = gunService.getInstance();
  if (!gun) {
    throw new Error('GunDB not initialized');
  }

  return new Promise<UserInfo[]>((resolve, reject) => {
    const users: UserInfo[] = [];

    try {
      // Check currently authenticated user
      const gunUser = gun.user();
      const userIs = gunUser.is as any;
      if (userIs && userIs.pub) {
        const userId = userIs.pub;
        const alias = userIs.alias;

        // Check if alias is actually a username (not a pub key)
        const isUsername = alias && !alias.includes('.') && alias.length < 100;

        users.push({
          userId,
          username: isUsername ? alias : undefined,
          createdAt: undefined,
          hasDocuments: false,
          documentCount: 0,
        });
      }

      // Also check GunDB's user storage for all SEA users
      const gunInternal = gun as any;
      const userGraph = gunInternal._?.user || {};

      Object.keys(userGraph).forEach((key) => {
        if (key.startsWith('~@')) {
          const alias = key.replace('~@', '');
          const userData = userGraph[key];
          if (userData && userData.pub) {
            const userId = userData.pub;
            const isUsername = alias && !alias.includes('.') && alias.length < 100;

            // Avoid duplicates
            if (!users.find(u => u.userId === userId)) {
              users.push({
                userId,
                username: isUsername ? alias : undefined,
                createdAt: undefined,
                hasDocuments: false,
                documentCount: 0,
              });
            }
          }
        }
      });

      resolve(users);
    } catch (error) {
      reject(error);
    }
  });
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
        const documents = data.documents || {};
        const documentKeys = Object.keys(documents).filter(
          (k) => k !== '_' && k !== '#' && documents[k] !== null && typeof documents[k] === 'object'
        );

        resolve({
          userId,
          username: profile.username,
          hasDocuments: documentKeys.length > 0,
          documentCount: documentKeys.length,
        });
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}
