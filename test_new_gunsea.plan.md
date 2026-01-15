# Test Plan: New GunDB + SEA Scheme

## Overview

Create a comprehensive browser-executable test (`src/test/testNewGunSEAScheme.ts`) to validate the new security-focused GunDB + SEA scheme from `code_references/gundb.md`. This test will implement and validate the improved approach that addresses security vulnerabilities in the current `profiles` system.

## Test Objectives

1. **Validate User Creation & Profile Storage** - Test the new `~@username` approach for secure profile storage
2. **Test User Profile Discovery** - Verify discovery of all users claiming a username
3. **Implement Private Data Storage** - Test hashed private paths with `.secret()` encryption
4. **Validate Contact System** - Test encrypted contact storage and retrieval
5. **Security Validation** - Ensure the new scheme prevents impersonation attacks

## Test Structure

### 1. Test Setup & Utilities

- Import GunDB, SEA, and existing gunService
- Create helper functions for user creation and authentication
- Add assertion helpers and timeout management
- Implement cleanup functions between test scenarios

### 2. Core Implementation Functions

Implement all functions from `code_references/gundb.md`:

```typescript
// Private path utilities
async getPrivatePathPart(plainPath: string): Promise<string>
async getPrivatePath(plainPath: string[]): Promise<string[]>
async getPrivateNode(plainPath: string[]): Promise<GunNodeRef>

// Private data operations
async writePrivateData(plainPath: string[], plaintext: string): Promise<void>
async readPrivateData(plainPath: string[]): Promise<string>
async readPrivateMap(plainPath: string[], fields: string[]): Promise<Record<string, string>[]>
```

### 3. Test Scenarios

#### Scenario 1: User Creation & Profile Storage

```typescript
// Test the new ~@username approach (Lines 22-33 from gundb.md)
await gun.user().create(username, password)
gun.get(`~@${username}`).put({ epub: user.epub })
```

- Verify user creation succeeds
- Validate profile storage in `~@username` namespace
- Confirm epub is properly stored

#### Scenario 2: User Profile Discovery

```typescript
// Test discovery of all users claiming a username (Lines 40-48 from gundb.md)
gun
  .get(`~@${username}`)
  .map()
  .once((data, pub) => {
    const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
    gun.get(`~${cleanPub}`).once(userNode => {
      // Verify we can retrieve pub/epub data
    })
  })
```

- Test finding users by username
- Validate pub/epub retrieval from discovered nodes
- Verify multiple users can claim same username

#### Scenario 3: Private Data Storage

```typescript
// Test hashed private paths with .secret() (Lines 56-79 from gundb.md)
await writePrivateData(['secret', 'note'], 'confidential data')
const decrypted = await readPrivateData(['secret', 'note'])
```

- Test node name hashing with `SEA.work()`
- Verify `.secret()` encryption/decryption
- Confirm data privacy from other users

#### Scenario 4: Contact System

```typescript
// Test adding contacts privately (Lines 105-108 from gundb.md)
await writePrivateData(['contacts', username, 'username'], username)
await writePrivateData(['contacts', username, 'pub'], pub)
await writePrivateData(['contacts', username, 'epub'], epub)
const contacts = await readPrivateMap(['contacts'], ['username', 'pub', 'epub'])
```

- Test contact storage with encrypted fields
- Validate structured contact data retrieval
- Verify contact system privacy

#### Scenario 5: End-to-End Workflow

- Create two users (Alice and Bob)
- Alice discovers Bob and adds him as contact
- Verify contact data is private to Alice
- Test that Bob cannot access Alice's contacts

### 4. Security Validation Tests

#### Security Test 1: Profile Impersonation Prevention

- Verify the new `~@username` system prevents the vulnerability in `gun.get('profiles')`
- Test that users cannot overwrite other users' profiles
    - Login with user; write profile
    - Login with same username and different password; write profile
    - Login with first user; read profile
- Confirm each user has their own namespace

#### Security Test 2: Private Data Encryption

- Verify private data is actually encrypted and not plaintext
    - Compare `.get().once()` vs `.decrypt().once()`
- Test that hashed paths obscure the data structure
    - Just test the getPrivatePathPart function for this
- Confirm unauthorized users cannot access private data (i.e. that it is scrambled)

#### Security Test 3: Contact System Privacy

- Test contact data is only decryptable by the owning user
- Verify contact discovery doesn't expose sensitive information
- Test contact list privacy between users

### 5. Browser Console Execution

#### Global Export

```typescript
// Export main test function for browser console
;(window as unknown as { testNewGunSEAScheme: () => Promise<void> }).testNewGunSEAScheme =
  testNewGunSEAScheme
```

#### Execution Methods

```javascript
// Method 1: Auto-run on import (optional)
await testNewGunSEAScheme()

// Method 2: Manual execution in browser console
await testNewGunSEAScheme()

// Method 3: Individual scenario testing
await testUserCreation()
await testProfileDiscovery()
await testPrivateDataStorage()
await testContactSystem()
```

### 6. Implementation Details

#### Hashing Implementation (Lines 56-64)

```typescript
async getPrivatePathPart(plainPath: string): Promise<string> {
  return await SEA.work(plainPath, gun.user()._.sea);
}

async getPrivatePath(plainPath: string[]): Promise<string[]> {
  return await Promise.all(
    plainPath.map(async (p: string) => await getPrivatePathPart(p))
  );
}
```

#### Contact Storage Structure

```typescript
// Private contacts stored as:
contacts -> [hashed_username] -> {
  [hashed_username]: encrypted_username,
  [hashed_pub]: encrypted_pub,
  [hashed_epub]: encrypted_epub
}
// All encrypted with hashed node names using .secret()
```

#### Error Handling Strategy

- Comprehensive try/catch with cleanup between scenarios
- Clear error messages indicating which step failed
- Proper user logout between test scenarios
- Timeout handling for GunDB async operations

### 7. Files to Create/Modify

#### Primary File

- `src/test/testNewGunSEAScheme.ts` - Main test implementation

#### Optional Updates

- `src/test/setup.ts` - Add test globals if needed
- `src/utils/testRunner.ts` - Useful helpers for testing
- Update import patterns if new dependencies required

### 8. Success Criteria

#### Functional Criteria

- [ ] All core functions from `code_references/gundb.md` implemented correctly
- [ ] User creation with secure profile storage working
- [ ] Profile discovery system functional
- [ ] Private data storage with hashed paths working
- [ ] Contact system fully functional
- [ ] Browser console execution successful

#### Security Criteria

- [ ] Profile impersonation vulnerability fixed
- [ ] Private data properly encrypted and inaccessible to unauthorized users
- [ ] Contact data privacy maintained
- [ ] Node names properly hashed and unguessable (i.e. test hashing of same name by different users)

#### Test Quality Criteria

- [ ] Comprehensive logging for step-by-step execution
- [ ] Proper cleanup between test scenarios
- [ ] Clear error reporting with step identification
- [ ] Browser console execution smooth and reliable

### 9. Browser Execution Instructions

#### Preparation

- The development server is already running
- The browser console is already open

#### Execution Commands

```javascript
// Run complete test suite
await testNewGunSEAScheme()
```

### 10. Expected Outcomes

#### Successful Test Results

- All test scenarios pass without errors
- Security vulnerabilities in current system resolved
- New scheme provides improved privacy and security
- Contact system functional and private
- Browser console execution smooth

#### Debugging Information

- Detailed logs for each test step
- Error messages with specific failure points
- Data validation outputs
- Security verification results

This comprehensive test plan will validate that the new GunDB + SEA scheme addresses the security vulnerabilities while providing a robust foundation for private data management and contact systems.
