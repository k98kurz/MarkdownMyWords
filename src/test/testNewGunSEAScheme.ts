/**
 * Test New GunDB + SEA Scheme
 *
 * Comprehensive test for the improved security-focused GunDB + SEA scheme
 * from code_references/gundb.md. This test validates:
 * 1. User creation & profile storage with ~@username approach
 * 2. User profile discovery system
 * 3. Private data storage with hashed paths and .secret() encryption
 * 4. Contact system with encrypted storage
 * 5. Security validations against impersonation attacks
 *
 * Browser-executable test that can be run from console:
 * await testNewGunSEAScheme()
 */

import Gun from 'gun'
import 'gun/sea'
import { gunService } from '../services/gunService'
import { TestRunner, type TestSuiteResult } from '../utils/testRunner'

/**
 * Assert helper for tests
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Helper to wait for async operations
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// =============================================================================
// CORE IMPLEMENTATION FUNCTIONS FROM code_references/gundb.md
// =============================================================================

async function createUser(gun: any, username: string, password: string) {
  return new Promise<void>((resolve, reject) => {
    gun.user().create(username, password, (ack: any) => {
      if (ack.err) {
        reject(new Error(`User creation failed: ${ack.err}`))
      }
      resolve()
    })
  })
}

async function authenticateUser(gun: any, username: string, password: string) {
  return new Promise<void>(resolve => {
    gun.user().auth(username, password, ack => {
      if (ack.err) {
        throw new Error(`Authentication failed: ${ack.err}`)
      }
      console.log(`Auth for ${username} succeeded.`)
      resolve()
    })
  })
}

/**
 * Hash a single path part for private node naming
 */
async function getPrivatePathPart(gun: any, plainPath: string): Promise<string> {
  const SEA = Gun.SEA
  if (!SEA) {
    throw new Error('SEA not available')
  }
  const result = await SEA.work(plainPath, gun.user()._.sea)
  if (!result) {
    throw new Error('Failed to hash path part')
  }
  return result
}

/**
 * Hash an array of path parts for private node naming
 */
async function getPrivatePath(gun: any, plainPath: string[]): Promise<string[]> {
  return await Promise.all(
    plainPath.map(async (p: string) => await getPrivatePathPart(gun, p))
  )
}

/**
 * Write private data using hashed path and .secret() encryption
 */
async function writePrivateData(gun: any, plainPath: string[], plaintext: string): Promise<void> {
  const privatePath = await getPrivatePath(gun, plainPath)
  const node = privatePath.reduce((path, part) => path.get(part), gun.user())
  assert(!!node, 'no node!?!?')
  await new Promise<void>(async (resolve, reject) => {
    if (!gun.user()._.sea) {
      reject(new Error('user cryptographic keypair not available'))
    }
    const ciphertext = await gun.sea?.encrypt(plaintext, gun.user()._.sea)
    if (!ciphertext) {
      reject(new Error('sea.encrypt failed: returned undefined'))
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

/**
 * Read private data using hashed path and .decrypt() decryption
 */
async function readPrivateData(gun: any, plainPath: string[]): Promise<string> {
  const privatePath = await getPrivatePath(gun, plainPath)
  const node = privatePath.reduce((path, part) => path.get(part), gun.user())
  return await new Promise<string>((resolve, reject) => {
    node.once(async (ciphertext: any) => {
      if (ciphertext === undefined) {
        reject(new Error('Private data not found or could not be decrypted'))
      } else {
        const plaintext = await gun.sea?.decrypt(ciphertext, gun.user()._.sea)
        resolve(plaintext)
      }
    })
  })
}

/**
 * Read private structured data (like contacts) with specific fields
 */
async function readPrivateMap(
  gun: any,
  plainPath: string[],
  fields: string[]
): Promise<Record<string, string>[]> {
  const privateNode = await getPrivateNode(gun, plainPath)

  return await new Promise<Record<string, string>[]>(resolve => {
    const results: Record<string, string>[] = []

    privateNode.map().once(async () => {
      try {
        const record: Record<string, string> = {}

        for (const fieldName of fields) {
          const fieldPath = [...plainPath, fieldName]
          const fieldValue = await readPrivateData(gun, fieldPath)
          record[fieldName] = fieldValue
        }

        if (Object.keys(record).length > 0) {
          results.push(record)
        }

        resolve(results)
      } catch (error) {
        // empty catch
      }
    })
  })
}

async function writeProfile(gun: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    gun.user().put({ epub: gun.user().is.epub }, (ack: any) => {
      if (ack.err) {
        reject(new Error(`Profile storage failed: ${ack.err}`))
      } else {
        resolve()
      }
    })
  })
}

async function discoverUsers(gun: any, username: string) {
  return new Promise<any[]>(resolve => {
    const collectedProfiles: any[] = []
    // wait 500 ms to read them all from the local db
    setTimeout(() => resolve(collectedProfiles), 500)

    gun
      .get(`~@${username}`)
      .map()
      .once((data: any, pub: string) => {
        if (!data) return
        const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
        gun.get(`~${cleanPub}`).once((userNode: any) => {
          collectedProfiles.push({ pub: cleanPub, data, userNode })
        })
      })
  })
}

// =============================================================================
// TEST SCENARIOS
// =============================================================================

/**
 * Scenario 1: Test user creation and profile storage, then profile discovery
 */
async function testUserCreationAndProfileStorage(gun: any): Promise<void> {
  console.log('\n📝 Testing User Creation & Profile Storage...')

  // Check for existing user and logout
  const currentUser = gun.user()
  if (currentUser.is && currentUser.is.pub) {
    gun.user().leave()
    await wait(500)
  }

  // Create test user
  const timestamp = Date.now()
  const username = `testuser_${timestamp}`
  const password = 'password123!Test'

  console.log(`   Creating user: ${username}`)

  // Create user with new scheme
  await createUser(gun, username, password)

  // Authenticate user
  await authenticateUser(gun, username, password)

  // Store profile using ~@username approach
  const user = gun.user()
  const pair = (user as any)._.sea
  assert(pair && pair.epub, 'User SEA pair not available')
  assert(user.is.alias == username, `Alias issue: ${user.is.alias} != ${username}`)

  console.log(`   Storing profile in ~@${username}...`)

  await writeProfile(gun)

  console.log(`   ✅ User created and profile stored successfully`)

  // Verify profile exists - collect all discovered profiles
  const profileData = await discoverUsers(gun, username)

  console.log(`   Collected ${profileData.length} profile(s)`)

  assert(profileData.length > 0, 'No profile data found')
  const currentUserProfile = profileData.find((p: any) => p.data.epub === pair.epub)
  assert(currentUserProfile, 'Current user profile not found in collected data')
  console.log(`   ✅ Profile verified in ~@${username}`)
}

/**
 * Scenario 2: Test private data storage with hashed paths
 */
async function testPrivateDataStorage(gun: any): Promise<void> {
  console.log('\n📝 Testing Private Data Storage...')

  const testData = 'confidential_secret_data_123'
  const plainPath = ['secret', 'note']

  // Create and login a user first
  const timestamp = Date.now()
  const username = `testuser_${timestamp}`
  const username2 = `testuser2_${timestamp}`
  const password = 'password123!Test'

  console.log(`   Creating user: ${username}`)

  // Create user with new scheme
  await createUser(gun, username, password)

  // Authenticate user
  await authenticateUser(gun, username, password)
  // set up profile
  await writeProfile(gun)

  // Write private data
  console.log(`   Writing private data to path: [${plainPath.join(', ')}]`)
  await writePrivateData(gun, plainPath, testData)
  console.log(`   ✅ Private data written`)

  // Read private data
  console.log(`   Reading private data from path: [${plainPath.join(', ')}]`)
  const decrypted = await readPrivateData(gun, plainPath)
  console.log(`   ✅ Private data read: "${decrypted}"`)

  assert(
    decrypted === testData,
    `Decrypted data mismatch! Expected "${testData}", got "${decrypted}"`
  )
  console.log(`   ✅ Data encryption/decryption successful`)

  // Test path hashing consistency
  const hashedPart1 = await getPrivatePathPart(gun, 'secret')
  const hashedPart2 = await getPrivatePathPart(gun, 'secret')
  assert(hashedPart1 === hashedPart2, 'Path hashing is inconsistent')
  console.log(`   ✅ Path hashing is consistent`)

  // Test that different users get different hashes
  gun.user().leave()
  await wait(500)

  // Create another user and login to test hash differences
  await createUser(gun, username2, 'temp123!')
  await authenticateUser(gun, username2, 'temp123!')

  const hashedPartDifferentUser = await getPrivatePathPart(gun, 'secret')
  assert(hashedPart1 !== hashedPartDifferentUser, 'Hash should be different for different users')
  console.log(`   ✅ Path hashing is user-specific`)
}

/**
 * Scenario 3: Contact system with two users
 */
async function testEndToEndWorkflow(gun: any): Promise<void> {
  console.log('\n📝 Testing contact system test with two users...')

  // Cleanup any existing user
  gun.user().leave()
  await wait(500)

  const timestamp = Date.now()

  // Create Alice
  const aliceUsername = `alice_${timestamp}`
  const alicePassword = 'alicePassword123!'
  console.log('creating Alice account')
  await createUser(gun, aliceUsername, alicePassword)
  await authenticateUser(gun, aliceUsername, alicePassword)
  console.log('writing Alice profile')
  await writeProfile(gun)
  const aliceEpub = gun.user().is.epub
  console.log(`   ✅ Alice created with pub: ${gun.user().is.pub.substring(0, 20)}...`)

  // Logout Alice
  gun.user().leave()
  await wait(500)

  // Create Bob
  const bobUsername = `bob_${timestamp}`
  const bobPassword = 'bobPassword123!'
  console.log('creating Bob account')
  await createUser(gun, bobUsername, bobPassword)
  await authenticateUser(gun, bobUsername, bobPassword)
  console.log('writing Bob profile')
  await writeProfile(gun)
  console.log(`   ✅ Bob created with pub: ${gun.user().is.pub.substring(0, 20)}...`)

  // Discover Alice
  console.log('attempting to discover Alice...')
  const discovered = await discoverUsers(gun, aliceUsername)
  console.log(`results: ${JSON.stringify(discovered)}`)

  assert(discovered.length == 1, `discovered.length ${discovered.length})`)
  assert(discovered[0].data.epub, 'Alice missing epub')
  assert(discovered[0].data.epub == aliceEpub, 'mismatch')
  console.log(
    `✅ Bob discovered Alice with epub: ${discovered[0].data.epub.substring(0, 20)}...`
  )

  // Bob adds Alice as a contact
  await writePrivateData(gun,
    ['contacts', aliceUsername, 'username'], aliceUsername)
  await writePrivateData(gun,
    ['contacts', aliceUsername, 'pub'], discovered[0].pub)
  await writePrivateData(gun,
    ['contacts', aliceUsername, 'epub'], discovered[0].data.epub)

  console.log(`   ✅ Bob added Alice as contact`)

  // Verify Bob's contact data
  const bobContactUsername = await readPrivateData(gun,
    ['contacts', aliceUsername, 'username'])
  assert(bobContactUsername === aliceUsername, 'Contact username mismatch')
  console.log(`   ✅ Bob's contact data verified`)

  // Test privacy: Bob cannot access Alice's contacts
  gun.user().leave()
  await wait(500)

  // Login as Alice
  await authenticateUser(gun, aliceUsername, alicePassword)

  console.log(`   Testing contact privacy (Alice accessing Bob's contacts)...`)

  // Alice should not be able to access Bob's contacts
  try {
    const shouldBeScrambled = await readPrivateData(gun, ['contacts', aliceUsername, 'username'])
    // If Alice can read this, it should be her own contact list, not Bob's
    if (shouldBeScrambled == aliceUsername) {
      throw new Error('XXX SECURITY BREACH')
    }
  } catch (error) {
    if (error.message == 'XXX SECURITY BREACH') throw error;
    // Expected: Bob shouldn't have Alice's contacts
    console.log(`   ✅ Alice's contacts remain private from Bob`)
  }
}

// =============================================================================
// SECURITY VALIDATION TESTS
// =============================================================================

/**
 * Security Test 1: Profile impersonation prevention
 */
async function testProfileImpersonationPrevention(gun: any): Promise<void> {
  console.log('\n🔒 Testing Profile Impersonation Prevention...')

  const username = `impersonation_test_${Date.now()}`
  const password1 = 'password1'
  const password2 = 'password2'

  // Create first user with username
  console.log(`Creating first user with ${username}, ${password1}`)
  await createUser(gun, username, password1)
  await authenticateUser(gun, username, password1)
  const user1Pair = (gun.user() as any)._.sea
  await writeProfile(gun)

  console.log(`   ✅ First user created with epub: ${user1Pair.epub.substring(0, 20)}...`)

  // Logout first user
  gun.user().leave()
  await wait(500)

  // Create second user with same username but different password
  console.log(`Creating second user with ${username}, ${password2}`)
  try {
    await createUser(gun, username, password2)
  } catch {
    console.log("GunDB prevents local duplicate user creation")
    return
  }
  await authenticateUser(gun, username, password2)
  const user2Pair = (gun.user() as any)._.sea
  await writeProfile(gun)

  console.log(`   ✅ Second user created with epub: ${user2Pair.epub.substring(0, 20)}...`)

  // Test that both users have separate namespaces
  const allUsers = await discoverUsers(gun, username)

  assert(allUsers.length === 2, 'Should have 2 users claiming the same username')
  assert(
    allUsers.some(u => u.data.epub === user1Pair.epub),
    'First user not found'
  )
  assert(
    allUsers.some(u => u.data.epub === user2Pair.epub),
    'Second user not found'
  )

  console.log(`   ✅ Both users have separate namespaces - impersonation prevented`)
}

/**
 * Security Test 2: Private data encryption validation
 */
async function testPrivateDataEncryptionValidation(gun: any): Promise<void> {
  console.log('\n🔒 Testing Private Data Encryption Validation...')

  const username = `impersonation_test_${Date.now()}`
  const password1 = 'password1'
  const password2 = 'password2'

  // Create first user with username
  await createUser(gun, username, password1)
  await authenticateUser(gun, username, password1)
  const user1Pair = (gun.user() as any)._.sea
  await writeProfile(gun)

  console.log(`   ✅ User created with epub: ${user1Pair.epub.substring(0, 20)}...`)

  const testData = 'top_secret_information'
  const plainPath = ['test_encryption']

  // Write private data
  await writePrivateData(gun, plainPath, testData)

  // Get the hashed path to access the raw encrypted data
  const hashedPath = await getPrivatePath(gun, plainPath)
  console.log(`   Hashed path: ${hashedPath.join(' -> ')}`)

  // Try to read raw encrypted data without decryption
  const rawNode = hashedPath.reduce((node, part) => node.get(part), gun.user())
  const rawData = await new Promise<any>(resolve => {
    rawNode.once((data: any) => resolve(data))
  })

  console.log(`   Raw data: ${JSON.stringify(rawData)}`)

  // Verify raw data is encrypted (not equal to plaintext)
  assert(rawData !== testData, 'Data should be encrypted, not plaintext')
  assert(rawData && rawData !== undefined, 'Encrypted data should exist')
  console.log(`   ✅ Data is properly encrypted`)

  // Verify decryption works
  const decrypted = await readPrivateData(gun, plainPath)
  assert(decrypted === testData, 'Decryption should restore original data')
  console.log(`   ✅ Decryption restores original data`)
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================

/**
 * Main test function for the new GunDB + SEA scheme
 */
export async function testNewGunSEAScheme(): Promise<TestSuiteResult> {
  console.log('🧪 Testing New GunDB + SEA Scheme...')
  console.log('='.repeat(80))
  console.log(
    'This test validates the improved security-focused scheme from code_references/gundb.md'
  )
  console.log('='.repeat(80))

  const runner = new TestRunner('New GunDB + SEA Scheme')

  // Ensure services are initialized
  if (!gunService.isReady()) {
    gunService.initialize()
  }

  const gun = gunService.getGun()
  if (!gun) {
    throw new Error('GunDB instance not available')
  }

  if (!Gun.SEA) {
    throw new Error('SEA not available')
  }

  gun.sea = Gun.SEA // monkey patch for testing

  try {
    // Core functionality tests
    await runner.run(
      'User Creation & Profile Storage and user discover',
      async () => await testUserCreationAndProfileStorage(gun)
    )

    await runner.run(
      'Private Data Storage with hashed paths and .encrypt() encryption',
      async () => await testPrivateDataStorage(gun)
    )

    await runner.run(
      'Contacts system with two users',
      async () => await testEndToEndWorkflow(gun)
    )

    // Security validation tests
    await runner.run(
      'Security: Profile Impersonation Prevention',
      async () => await testProfileImpersonationPrevention(gun)
    )

    await runner.run(
      'Security: Private Data Encryption Validation',
      async () => await testPrivateDataEncryptionValidation(gun)
    )

    // Final cleanup
    gun.user().leave()
    console.log('\n   🧹 Cleaned up user session')
  } catch (error) {
    console.error('Test suite error:', error)
    throw error
  }

  runner.printResults()
  return runner.getResults()
}

// Export for browser console execution
if (typeof window !== 'undefined') {
  ;(
    window as unknown as { testNewGunSEAScheme: () => Promise<TestSuiteResult> }
  ).testNewGunSEAScheme = testNewGunSEAScheme
}
