import { gunService, type DiscoveredUser } from '../services/gunService';

export interface GroupedUserResults {
  [username: string]: DiscoveredUser[];
}

export async function listUsers(
  usernames: string[]
): Promise<GroupedUserResults> {
  const results: GroupedUserResults = {};

  for (const username of usernames) {
    try {
      const discoveredUsers = await gunService.discoverUsers(username);
      results[username] = discoveredUsers;
    } catch (error) {
      console.error(
        `Failed to discover users for username "${username}":`,
        error
      );
      results[username] = [];
    }
  }

  return results;
}
