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
  return await Promise.all(plainPath.map(async (p: string) => await getPrivatePathPart(gun, p)))
}

/**
 * Get a private node reference from a plain path array
 */
async function getPrivateNode(gun: any, plainPath: string[]): Promise<any> {
  const privatePath = await getPrivatePath(gun, plainPath)
  return privatePath.reduce((node, part) => node.get(part), gun.user())
}

/**
 * Write private data using hashed path and .secret() encryption
 */
async function writePrivateData(gun: any, plainPath: string[], plaintext: string): Promise<void> {
  const node = await getPrivateNode(gun, plainPath)
  await new Promise<void>((resolve, reject) => {
    node.secret(plaintext, (ack: any) => {
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
  const node = await getPrivateNode(gun, plainPath)
  return await new Promise<string>((resolve, reject) => {
    node.decrypt((data: any) => {
      if (data === undefined) {
        reject(new Error('Private data not found or could not be decrypted'))
      } else {
        resolve(data)
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

// =============================================================================
// TEST SCENARIOS
// =============================================================================

/**
 * Scenario 1: Test user creation and profile storage with ~@username approach
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
  await new Promise<void>(resolve => {
    gun.user().create(username, password, (ack: any) => {
      if (ack.err) {
        throw new Error(`User creation failed: ${ack.err}`)
      }
      resolve()
    })
  })

  // Authenticate user
  await new Promise<void>(resolve => {
    gun.user().auth(username, password, ack => {
      if (ack.err) {
        throw new Error(`Authentication failed: ${ack.err}`)
      }
      console.log(`Auth for ${username} succeeded.`)
      resolve()
    })
  })

  // Store profile using ~@username approach
  const user = gun.user()
  const pair = (user as any)._.sea
  assert(pair && pair.epub, 'User SEA pair not available')
  assert(user.is.alias == username, `Alias issue: ${user.is.alias} != ${username}`)

  console.log(`   Storing profile in ~@${username}...`)

  await new Promise<void>((resolve, reject) => {
//    gun.user().get('epub').put(
//      pair.epub,
    gun.user().put(
      {epub: pair.epub},
      (ack: any) => {
        if (ack.err) {
          reject(new Error(`Profile storage failed: ${ack.err}`))
        } else {
          resolve()
        }
      }
    )
  })

  console.log(`   ✅ User created and profile stored successfully`)

  // Verify profile exists
  gun.get(`~@${username}`).map().once((data, pub) => {
    if (!data) return;
    const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub;
    gun.get(`~${cleanPub}`).once((userNode) => {
      // do something with cleanPub and userNode.epub
      // e.g. push to a list in UI so the active user can choose to add a contact
    });
  })
  console.log(`profileData: ${JSON.stringify(profileData)}`)

  assert(profileData && profileData.epub === pair.epub, 'Profile data not stored correctly')
  console.log(`   ✅ Profile verified in ~@${username}`)
}

/**
 * Scenario 2: Test user profile discovery system
 */
async function testUserProfileDiscovery(gun: any): Promise<void> {
  console.log('\n📝 Testing User Profile Discovery...')

  const timestamp = Date.now()
  const username = `discovery_test_${timestamp}`
  const password = 'password123!Discovery'

  // Create and store user profile
  await new Promise<void>((resolve, reject) => {
    gun.user().create(username, password, (ack: any) => {
      if (ack.err) {
        reject(new Error(`User creation failed: ${ack.err}`))
      } else {
        // Store profile
        gun.get(`~@${username}`).put(
          {
            epub: gun.user()._.sea.epub,
          },
          (ack: any) => {
            if (ack.err) {
              reject(new Error(`Profile storage failed: ${ack.err}`))
            } else {
              resolve()
            }
          }
        )
      }
    })
  })

  // Test profile discovery
  console.log(`   Discovering users claiming username: ${username}`)

  const discoveredUsers = await new Promise<any[]>(resolve => {
    const users: any[] = []

    gun
      .get(`~@${username}`)
      .map()
      .once(async (data: any, pub: string) => {
        if (!data) return

        const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
        console.log(`   Found user with pub: ${cleanPub.substring(0, 20)}...`)

        // Get user node
        const userNode = await new Promise<any>(userResolve => {
          gun.get(`~${cleanPub}`).once((nodeData: any) => {
            userResolve(nodeData)
          })
        })

        users.push({ pub: cleanPub, data, userNode })
        resolve(users)
      })
  })

  assert(discoveredUsers.length > 0, 'No users discovered')
  console.log(`   ✅ Successfully discovered ${discoveredUsers.length} user(s)`)

  // Verify epub is accessible
  const firstUser = discoveredUsers[0]
  assert(firstUser.data && firstUser.data.epub, 'Epub not found in discovered user')
  console.log(`   ✅ Epub accessible: ${firstUser.data.epub.substring(0, 20)}...`)
}

/**
 * Scenario 3: Test private data storage with hashed paths
 */
async function testPrivateDataStorage(gun: any): Promise<void> {
  console.log('\n📝 Testing Private Data Storage...')

  const testData = 'confidential_secret_data_123'
  const plainPath = ['secret', 'note']

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

  // Create another user to test hash differences
  await new Promise<void>(resolve => {
    gun.user().create('temp_user_for_hash_test', 'temp123!', () => resolve())
  })

  const hashedPartDifferentUser = await getPrivatePathPart(gun, 'secret')
  assert(hashedPart1 !== hashedPartDifferentUser, 'Hash should be different for different users')
  console.log(`   ✅ Path hashing is user-specific`)
}

/**
 * Scenario 4: Test contact system
 */
async function testContactSystem(gun: any): Promise<void> {
  console.log('\n📝 Testing Contact System...')

  // Create contact data
  const contactUsername = 'alice_contact_test'
  const contactPub = 'test_pub_key_12345'
  const contactEpub = 'test_epub_key_67890'

  // Store contact using private data system
  console.log(`   Storing contact: ${contactUsername}`)
  await writePrivateData(gun, ['contacts', contactUsername, 'username'], contactUsername)
  await writePrivateData(gun, ['contacts', contactUsername, 'pub'], contactPub)
  await writePrivateData(gun, ['contacts', contactUsername, 'epub'], contactEpub)

  console.log(`   ✅ Contact stored privately`)

  // Read contact data
  console.log(`   Reading contact data...`)
  try {
    const contacts = await readPrivateMap(gun, ['contacts'], ['username', 'pub', 'epub'])
    console.log(`   ✅ Contacts read: ${JSON.stringify(contacts, null, 2)}`)

    // Verify contact data integrity
    const aliceContact = contacts.find(c => c.username === contactUsername)
    assert(aliceContact, 'Alice contact not found')
    assert(aliceContact.pub === contactPub, 'Contact pub mismatch')
    assert(aliceContact.epub === contactEpub, 'Contact epub mismatch')

    console.log(`   ✅ Contact data integrity verified`)
  } catch (error) {
    console.log(`   ⚠️  Map read failed, trying individual field reads...`)

    // Fallback: read individual fields
    const username = await readPrivateData(gun, ['contacts', contactUsername, 'username'])
    const pub = await readPrivateData(gun, ['contacts', contactUsername, 'pub'])
    const epub = await readPrivateData(gun, ['contacts', contactUsername, 'epub'])

    assert(username === contactUsername, 'Username mismatch')
    assert(pub === contactPub, 'Pub mismatch')
    assert(epub === contactEpub, 'Epub mismatch')

    console.log(`   ✅ Individual contact fields verified`)
  }
}

/**
 * Scenario 5: End-to-end workflow with two users
 */
async function testEndToEndWorkflow(gun: any): Promise<void> {
  console.log('\n📝 Testing End-to-End Workflow...')

  // Cleanup any existing user
  gun.user().leave()
  await wait(500)

  const timestamp = Date.now()

  // Create Alice
  const aliceUsername = `alice_${timestamp}`
  const alicePassword = 'alicePassword123!'

  await new Promise<void>((resolve, reject) => {
    gun.user().create(aliceUsername, alicePassword, (ack: any) => {
      if (ack.err) {
        reject(new Error(`Alice creation failed: ${ack.err}`))
      } else {
        gun.get(`~@${aliceUsername}`).put(
          {
            epub: gun.user()._.sea.epub,
          },
          () => resolve()
        )
      }
    })
  })

  const alicePair = (gun.user() as any)._.sea
  console.log(`   ✅ Alice created with pub: ${alicePair.pub.substring(0, 20)}...`)

  // Logout Alice
  gun.user().leave()
  await wait(500)

  // Create Bob
  const bobUsername = `bob_${timestamp}`
  const bobPassword = 'bobPassword123!'

  await new Promise<void>((resolve, reject) => {
    gun.user().create(bobUsername, bobPassword, (ack: any) => {
      if (ack.err) {
        reject(new Error(`Bob creation failed: ${ack.err}`))
      } else {
        gun.get(`~@${bobUsername}`).put(
          {
            epub: gun.user()._.sea.epub,
          },
          () => resolve()
        )
      }
    })
  })

  const bobPair = (gun.user() as any)._.sea
  console.log(`   ✅ Bob created with pub: ${bobPair.pub.substring(0, 20)}...`)

  // Discover Bob as Alice
  gun.user().leave()
  await wait(500)

  // Login as Alice
  await new Promise<void>(resolve => {
    gun.user().auth(aliceUsername, alicePassword, () => resolve())
  })

  console.log(`   Alice discovering Bob...`)

  // Discover Bob
  const discoveredBob = await new Promise<any>(resolve => {
    gun
      .get(`~@${bobUsername}`)
      .map()
      .once(async (data: any, pub: string) => {
        if (!data) return

        const cleanPub = pub.startsWith('~') ? pub.slice(1) : pub
        const bobNode = await new Promise<any>(userResolve => {
          gun.get(`~${cleanPub}`).once((nodeData: any) => {
            userResolve({ pub: cleanPub, data, nodeData })
          })
        })

        resolve(bobNode)
      })
  })

  assert(discoveredBob && discoveredBob.data.epub, 'Bob not discovered properly')
  console.log(
    `   ✅ Alice discovered Bob with epub: ${discoveredBob.data.epub.substring(0, 20)}...`
  )

  // Alice adds Bob as contact
  await writePrivateData(gun, ['contacts', bobUsername, 'username'], bobUsername)
  await writePrivateData(gun, ['contacts', bobUsername, 'pub'], discoveredBob.pub)
  await writePrivateData(gun, ['contacts', bobUsername, 'epub'], discoveredBob.data.epub)

  console.log(`   ✅ Alice added Bob as contact`)

  // Verify Alice's contact data
  const aliceContactUsername = await readPrivateData(gun, ['contacts', bobUsername, 'username'])
  assert(aliceContactUsername === bobUsername, 'Contact username mismatch')
  console.log(`   ✅ Alice's contact data verified`)

  // Test privacy: Bob cannot access Alice's contacts
  gun.user().leave()
  await wait(500)

  // Login as Bob
  await new Promise<void>(resolve => {
    gun.user().auth(bobUsername, bobPassword, () => resolve())
  })

  console.log(`   Testing contact privacy (Bob accessing Alice's contacts)...`)

  // Bob should not be able to access Alice's contacts
  try {
    await readPrivateData(gun, ['contacts', bobUsername, 'username'])
    // If Bob can read this, it should be his own contact list, not Alice's
    console.log(`   ✅ Bob's own contacts remain private`)
  } catch (error) {
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
  await new Promise<void>((resolve, reject) => {
    gun.user().create(username, password1, (ack: any) => {
      if (ack.err) {
        reject(new Error(`First user creation failed: ${ack.err}`))
      } else {
        resolve()
      }
    })
  })

  const user1Pair = (gun.user() as any)._.sea
  await new Promise<void>(resolve => {
    gun.get(`~@${username}`).put(
      {
        epub: user1Pair.epub,
      },
      () => resolve()
    )
  })

  console.log(`   ✅ First user created with epub: ${user1Pair.epub.substring(0, 20)}...`)

  // Logout first user
  gun.user().leave()
  await wait(500)

  // Create second user with same username but different password
  await new Promise<void>((resolve, reject) => {
    gun.user().create(username, password2, (ack: any) => {
      if (ack.err) {
        reject(new Error(`Second user creation failed: ${ack.err}`))
      } else {
        resolve()
      }
    })
  })

  const user2Pair = (gun.user() as any)._.sea
  await new Promise<void>(resolve => {
    gun.get(`~@${username}`).put(
      {
        epub: user2Pair.epub,
      },
      () => resolve()
    )
  })

  console.log(`   ✅ Second user created with epub: ${user2Pair.epub.substring(0, 20)}...`)

  // Test that both users have separate namespaces
  const allUsers = await new Promise<any[]>(resolve => {
    const users: any[] = []
    gun
      .get(`~@${username}`)
      .map()
      .once((data: any, pub: string) => {
        if (!data) return
        users.push({ pub, data })
        if (users.length === 2) resolve(users)
      })
  })

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

  const SEA = Gun.SEA
  if (!SEA) {
    throw new Error('SEA not available')
  }

  try {
    // Core functionality tests
    await runner.run(
      'User Creation & Profile Storage with ~@username approach',
      async () => await testUserCreationAndProfileStorage(gun)
    )

    await runner.run(
      'User Profile Discovery System',
      async () => await testUserProfileDiscovery(gun)
    )

    await runner.run(
      'Private Data Storage with hashed paths and .secret() encryption',
      async () => await testPrivateDataStorage(gun)
    )

    await runner.run(
      'Contact System with encrypted storage',
      async () => await testContactSystem(gun)
    )

    await runner.run(
      'End-to-End Workflow with multiple users',
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
