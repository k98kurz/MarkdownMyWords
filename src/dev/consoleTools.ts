import { gunService, type DiscoveredUser } from '@/services/gunService';

export interface GroupedUserResults {
  [username: string]: DiscoveredUser[];
}

export async function listUsers(
  usernames: string[]
): Promise<GroupedUserResults> {
  const results: GroupedUserResults = {};

  for (const username of usernames) {
    const result = await gunService.discoverUsers(username);
    if (result.success) {
      results[username] = result.data;
    } else {
      console.error(
        `Failed to discover users for username "${username}":`,
        result.error
      );
      results[username] = [];
    }
  }

  return results;
}
