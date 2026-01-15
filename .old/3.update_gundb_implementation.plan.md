# GunDB Implementation Update Plan

Date: 2026-01-15

## Overview

Update `gunService.ts` and `authStore.ts` to comply with the conventions specified in `code_references/gundb.md`. This includes adding new methods that follow the correct GunDB + SEA patterns and removing deprecated methods that use the old 'profiles directory' pattern.

---

## Changes to gunService.ts

### 1. Remove Deprecated Methods

#### 1.1 Remove `storeUserProfile()` (lines 1189-1216)

- **Reason**: Uses deprecated 'profiles directory' pattern (`gun.get('profiles').get(username)`)
- **Replacement**: `writeProfile()` method (new)

#### 1.2 Remove `getUserEpub()` (lines 1218-1238)

- **Reason**: Uses deprecated 'profiles directory' pattern
- **Replacement**: `discoverUsers()` method (new)

---

### 2. Add New Methods

#### 2.1 `writeProfile(): Promise<void>`

- **Purpose**: Store user profile for discovery by other users
- **Reference**: gundb.md:49-58
- **Pattern**: `gun.user().put({ epub: gun.user().is.epub })`
- **Implementation**:
  ```typescript
  async writeProfile(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.gun.user().put({ epub: this.gun.user().is.epub }, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Profile storage failed: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
  }
  ```

#### 2.2 `discoverUsers(username: string): Promise<{ pub: string; data: any; userNode: any }[]>`

- **Purpose**: Discover users who claim a specific username
- **Reference**: gundb.md:76-93
- **Pattern**: `gun.get(~@username).map().once()`
- **Implementation**:

  ```typescript
  async discoverUsers(username: string): Promise<any[]> {
    return new Promise<any[]>(resolve => {
      const collectedProfiles: any[] = []
      setTimeout(() => resolve(collectedProfiles), 500)

      gun
        .get(`~@${username}`)
        .map()
        .once((data: any, pub: string) => {
          if (!data) return
          const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
          this.gun.get(`~${cleanPub}`).once((userNode: any) => {
            collectedProfiles.push({ pub: cleanPub, data, userNode })
          })
        })
    })
  }
  ```

#### 2.3 `getPrivatePathPart(plainPath: string): Promise<string>`

- **Purpose**: Hash a path part for private data storage
- **Reference**: gundb.md:103-113
- **Pattern**: `SEA.work(plainPath, gun.user()._.sea)`
- **Implementation**:
  ```typescript
  async getPrivatePathPart(plainPath: string): Promise<string> {
    const SEA = Gun.SEA
    if (!SEA) {
      throw new Error('SEA not available')
    }
    const result = await SEA.work(plainPath, this.gun.user()._.sea)
    if (!result) {
      throw new Error('Failed to hash path part')
    }
    return result
  }
  ```

#### 2.4 `getPrivatePath(plainPath: string[]): Promise<string[]>`

- **Purpose**: Hash all path parts for private data storage
- **Reference**: gundb.md:115-119
- **Pattern**: Maps `getPrivatePathPart` over array
- **Implementation**:
  ```typescript
  async getPrivatePath(plainPath: string[]): Promise<string[]> {
    return await Promise.all(
      plainPath.map(async (p: string) => await this.getPrivatePathPart(p))
    )
  }
  ```

#### 2.5 `writePrivateData(plainPath: string[], plaintext: string): Promise<void>`

- **Purpose**: Write encrypted private data to user storage
- **Reference**: gundb.md:121-145
- **Pattern**: Hash path → encrypt with `gun.user()._.sea` → store at hashed path
- **Implementation**:

  ```typescript
  async writePrivateData(plainPath: string[], plaintext: string): Promise<void> {
    const privatePath = await this.getPrivatePath(plainPath)
    const node = privatePath.reduce((path, part) => path.get(part), this.gun.user())

    return new Promise<void>(async (resolve, reject) => {
      if (!this.gun.user()._.sea) {
        reject(new Error('User cryptographic keypair not available'))
        return
      }

      const ciphertext = await Gun.SEA?.encrypt(plaintext, this.gun.user()._.sea)
      if (!ciphertext) {
        reject(new Error('SEA.encrypt failed: returned undefined'))
        return
      }

      node.put(ciphertext, (ack: any) => {
        if (ack && ack.err) {
          reject(new Error(`Failed to write private data: ${ack.err}`))
        } else {
          resolve()
        }
      })
    })
  }
  ```

#### 2.6 `readPrivateData(plainPath: string[], hashedPath?: string[]): Promise<string>`

- **Purpose**: Read and decrypt private data from user storage
- **Reference**: gundb.md:147-165
- **Pattern**: Get path → decrypt with `gun.user()._.sea` → return plaintext
- **Implementation**:

  ```typescript
  async readPrivateData(
    plainPath: string[],
    hashedPath?: string[]
  ): Promise<string> {
    const path = hashedPath || (await this.getPrivatePath(plainPath))
    const node = path.reduce((p, part) => p.get(part), this.gun.user())

    return await new Promise<string>((resolve, reject) => {
      node.once(async (ciphertext: any) => {
        if (ciphertext === undefined) {
          reject(new Error('Private data not found or could not be decrypted'))
        } else {
          const plaintext = await Gun.SEA?.decrypt(ciphertext, this.gun.user()._.sea)
          resolve(plaintext)
        }
      })
    })
  }
  ```

#### 2.7 `readPrivateMap(plainPath: string[], fields: string[]): Promise<Record<string, string>[]>`

- **Purpose**: Read private structured data (like contacts) by iterating keys
- **Reference**: gundb.md:167-215
- **Pattern**: Collect keys from map → access each field at privatePath + key + hashedFieldName
- **Implementation**:

  ```typescript
  async readPrivateMap(
    plainPath: string[],
    fields: string[]
  ): Promise<Record<string, string>[]> {
    const privatePath = await this.getPrivatePath(plainPath)
    const privateNode = privatePath.reduce((path, part) => path.get(part), this.gun.user())

    // First, collect all keys from the map
    const keys: string[] = await new Promise<string[]>(resolve => {
      const collectedKeys: string[] = []
      setTimeout(() => resolve(collectedKeys), 500)

      privateNode.map().once((data: any, key: string) => {
        if (key) {
          collectedKeys.push(key)
        }
      })
    })

    // Then for each key, access the fields at privatePath + [key] + [hashedFieldName]
    const results: Record<string, string>[] = []
    for (const key of keys) {
      try {
        const record: Record<string, string> = {}
        for (const fieldName of fields) {
          const fieldNameHash = await this.getPrivatePathPart(fieldName)
          const fullHashedPath = [...privatePath, key, fieldNameHash]
          const fieldValue = await this.readPrivateData([], fullHashedPath)
          record[fieldName] = fieldValue
        }
        if (Object.keys(record).length > 0) {
          results.push(record)
        }
      } catch (error: Error) {
        console.error(`Failed to read contact for key ${key}:`, error.message)
      }
    }

    return results
  }
  ```

---

## Changes to authStore.ts

### 1. Update `register()` Action

**Current Implementation (problematic):**

- Calls `createSEAUser()` then `putUserProfile()` directly

**Updated Implementation (per gundb.md:61-66):**

```typescript
register: async (username: string, password: string) => {
  set({ isLoading: true, error: null })

  try {
    // Validate inputs
    if (!username || username.trim().length === 0) {
      throw new Error('Username is required')
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters')
    }

    // Create user with SEA
    await gunService.createSEAUser(username.trim(), password)

    // Authenticate user with SEA
    await gunService.authenticateSEAUser(username.trim(), password)

    // Write profile for discovery by other users
    await gunService.writeProfile()

    // Get GunDB instance to access user object
    const gun = gunService.getInstance()
    if (!gun) {
      throw new Error('GunDB not initialized')
    }

    // Set authenticated state
    set({
      user: gun.user(),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    })
  } catch (error: any) {
    // ... existing error handling
  }
}
```

**Changes:**

1. Remove existing `putUserProfile()` call
2. Add new `gunService.writeProfile()` call after authentication
3. Keep existing validation and error handling logic

---

## TypeScript Type Updates (src/types/gun.ts)

Add new interfaces if not present:

```typescript
/**
 * Discovered user profile from username lookup
 */
export interface DiscoveredUser {
  pub: string
  data: {
    epub?: string
    [key: string]: any
  }
  userNode: any
}

/**
 * Private data record from readPrivateMap
 */
export interface PrivateDataRecord {
  [fieldName: string]: string
}
```

---

## Implementation Order

1. **Add new methods to gunService.ts**
   - Add `writeProfile()`
   - Add `discoverUsers()`
   - Add private path helpers and private data methods

2. **Remove deprecated methods from gunService.ts**
   - Remove `storeUserProfile()`
   - Remove `getUserEpub()`

3. **Update authStore.ts**
   - Update `register()` to use `writeProfile()` instead of `putUserProfile()`

4. **Update types/gun.ts (if needed)**
   - Add `DiscoveredUser` and `PrivateDataRecord` interfaces

5. **Build and verify**
   - Run `npm run build` to ensure no syntax errors
   - Run lint if available

---

## Reference Patterns Summary

### User Management (per gundb.md)

```typescript
// Create user
gun.user().create(username, password, callback)

// Authenticate user
gun.user().auth(username, password, callback)

// Write profile for discovery
gun.user().put({ epub: gun.user().is.epub }, callback)

// Discover users by username
gun.get(`~@${username}`).map().once((data, pub) => { ... })
```

### Private Data (per gundb.md)

```typescript
// Hash path part
SEA.work(plainPath, gun.user()._.sea)

// Encrypt and write
const ciphertext = await SEA.encrypt(plaintext, gun.user()._.sea)
node.put(ciphertext, callback)

// Read and decrypt
node.once(async ciphertext => {
  const plaintext = await SEA.decrypt(ciphertext, gun.user()._.sea)
})
```

---

## Testing Notes

- GunDB does not work reliably in node.js environment
- All tests must be done in browser dev console
- See `src/utils/testRunner.ts` for testing utilities

---

## Files Modified

| File                         | Changes                    |
| ---------------------------- | -------------------------- |
| `src/services/gunService.ts` | +7 methods, -2 methods     |
| `src/stores/authStore.ts`    | Update `register()` action |
| `src/types/gun.ts`           | +2 interfaces (if needed)  |
