/**
 * Test ECDH Key Exchange Between GunDB Users
 *
 * This test creates two GunDB users, then performs ECDH key exchange
 * between them using their public epubs read from GunDB profiles directory.
 * It follows correct pattern using SEA.secret() with epub/epriv keys.
 *
 * The test flow:
 * 1. Create Alice and Bob users, store their profiles in gun.get('profiles')
 * 2. Login as Alice, read Bob's epub from profiles, derive shared secret
 * 3. Login as Bob, read Alice's epub from profiles, derive shared secret
 * 4. Verify both shared secrets are identical
 * 5. Test encryption/decryption with shared secrets
 */

import Gun from 'gun'
import 'gun/sea'
import { gunService } from '../gunService'
import { TestRunner, type TestSuiteResult } from '../../utils/testRunner'

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

/**
 * Store user profile in GunDB profiles directory
 */
async function storeUserProfile(gun: any, username: string): Promise<void> {
  const user = gun.user()
  const pair = (user as any)._.sea

  return new Promise<void>((resolve, reject) => {
    gun
      .get('profiles')
      .get(username)
      .put(
        {
          pub: pair.pub,
          epub: pair.epub,
        },
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to store profile for ${username}: ${ack.err}`))
          } else {
            resolve()
          }
        }
      )
  })
}

/**
 * Read user epub from GunDB profiles directory
 */
async function readUserEpub(gun: any, username: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    gun
      .get('profiles')
      .get(username)
      .get('epub')
      .once((data: any) => {
        if (data) {
          resolve(data)
        } else {
          reject(new Error(`Failed to read ${username}'s epub from profiles`))
        }
      })
  })
}

/**
 * Test ECDH key exchange between two GunDB users using their public epubs
 */
export async function testNonEphemeralECDH(): Promise<TestSuiteResult> {
  console.log('🧪 Testing ECDH Key Exchange Between GunDB Users...\n')
  console.log('='.repeat(60))

  const runner = new TestRunner('ECDH Key Exchange')

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

  await runner.run(
    'ECDH key sharing between two GunDB users using gun.get(profiles).get(username).epub pattern',
    async () => {
      // Check if a user is already logged in and log them out
      console.log('📝 Pre-test: Check for existing user session')
      const currentUser = gun.user()
      if (currentUser.is && currentUser.is.pub) {
        console.log(`   ⚠️  User already logged in, logging out...`)
        gun.user().leave()
        await wait(500)
      }

      // Create unique usernames for test
      const timestamp = Date.now()
      const aliceUsername = `alice_test_ecdh_${timestamp}`
      const bobUsername = `bob_test_ecdh_${timestamp}`
      const alicePassword = 'password123!Alice'
      const bobPassword = 'password123!Bob'

      console.log('\n📝 Step 1: Creating two users...')

      // Create Alice
      console.log(`   Creating Alice: ${aliceUsername}`)
      await gunService.createSEAUser(aliceUsername, alicePassword)
      const alicePub = await gunService.waitForUserState()
      console.log(`   ✅ Alice created with pub: ${alicePub.substring(0, 20)}...`)

      // Store Alice's profile in profiles directory
      console.log(`   Storing Alice's profile...`)
      await storeUserProfile(gun, aliceUsername)
      console.log(`   ✅ Alice's profile stored`)

      // Logout Alice to create Bob
      gun.user().leave()
      await wait(500)

      // Create Bob
      console.log(`   Creating Bob: ${bobUsername}`)
      await gunService.createSEAUser(bobUsername, bobPassword)
      const bobPub = await gunService.waitForUserState()
      console.log(`   ✅ Bob created with pub: ${bobPub.substring(0, 20)}...`)

      // Store Bob's profile in profiles directory
      console.log(`   Storing Bob's profile...`)
      await storeUserProfile(gun, bobUsername)
      console.log(`   ✅ Bob's profile stored`)

      // Step 2: Login as Alice and read Bob's epub
      console.log('\n📝 Step 2: Login as Alice and derive shared secret...')
      gun.user().leave()
      await wait(500)

      // Login as Alice
      gun.user().auth(aliceUsername, alicePassword)
      await wait(500)

      const aliceUser = gun.user()
      assert(aliceUser.is && aliceUser.is.pub, 'Alice authentication failed')
      console.log(`   ✅ Alice authenticated`)

      // Read Bob's epub from profiles directory
      console.log(`   Reading Bob's epub from profiles directory...`)
      const bobEpub = await readUserEpub(gun, bobUsername)
      console.log(`   ✅ Bob's epub: ${bobEpub.substring(0, 20)}...`)

      // Get Alice's key pair
      const alicePair = (aliceUser as any)._.sea as { epriv: string; epub: string; pub?: string }
      assert(alicePair && alicePair.epriv && alicePair.epub, 'Failed to get Alice key pair')
      console.log(`   ✅ Alice key pair retrieved`)

      // Derive shared secret from Alice's perspective
      console.log(`   Deriving shared secret (Alice -> Bob)...`)
      const sharedSecret1 = await SEA.secret({ epub: bobEpub }, alicePair)
      assert(sharedSecret1, 'Failed to derive shared secret from Alice perspective')
      console.log(`   ✅ Shared secret derived: ${sharedSecret1.substring(0, 20)}...`)

      // Step 3: Login as Bob and read Alice's epub
      console.log('\n📝 Step 3: Login as Bob and derive shared secret...')
      gun.user().leave()
      await wait(500)

      // Login as Bob
      gun.user().auth(bobUsername, bobPassword)
      await wait(500)

      const bobUser = gun.user()
      assert(bobUser.is && bobUser.is.pub, 'Bob authentication failed')
      console.log(`   ✅ Bob authenticated`)

      // Read Alice's epub from profiles directory
      console.log(`   Reading Alice's epub from profiles directory...`)
      const aliceEpub = await readUserEpub(gun, aliceUsername)
      console.log(`   ✅ Alice's epub: ${aliceEpub.substring(0, 20)}...`)

      // Get Bob's key pair
      const bobPair = (bobUser as any)._.sea as { epriv: string; epub: string; pub?: string }
      assert(bobPair && bobPair.epriv && bobPair.epub, 'Failed to get Bob key pair')
      console.log(`   ✅ Bob key pair retrieved`)

      // Derive shared secret from Bob's perspective
      console.log(`   Deriving shared secret (Bob -> Alice)...`)
      const sharedSecret2 = await SEA.secret({ epub: aliceEpub }, bobPair)
      assert(sharedSecret2, 'Failed to derive shared secret from Bob perspective')
      console.log(`   ✅ Shared secret derived: ${sharedSecret2.substring(0, 20)}...`)

      // Step 4: Verify both shared secrets are identical
      console.log('\n📝 Step 4: Verifying shared secrets match...')
      assert(
        sharedSecret1 === sharedSecret2,
        `Shared secrets do not match! Secret1: ${sharedSecret1.substring(0, 20)}..., Secret2: ${sharedSecret2.substring(0, 20)}...`
      )
      console.log('   ✅ Both shared secrets match (ECDH working correctly)')

      // Step 5: Test encryption/decryption round-trip
      console.log('\n📝 Step 5: Testing encryption/decryption with shared secret...')
      const message = 'Hello from Alice to Bob via ECDH!'
      console.log(`   Original message: "${message}"`)

      // Encrypt with Alice's shared secret
      const encrypted = await SEA.encrypt(message, sharedSecret1)
      assert(encrypted && encrypted !== message, 'Encryption failed')
      console.log(`   ✅ Message encrypted: ${encrypted.substring(0, 30)}...`)

      // Decrypt with Bob's shared secret
      const decrypted = await SEA.decrypt(encrypted, sharedSecret2)
      assert(decrypted, 'Decryption failed')
      assert(decrypted === message, `Decryption failed! Expected "${message}", got "${decrypted}"`)
      console.log(`   ✅ Message decrypted: "${decrypted}"`)

      // Cleanup: Logout any logged in user
      gun.user().leave()
      console.log('\n   ✅ Test completed successfully!')
    }
  )

  runner.printResults()
  return runner.getResults()
}

// Auto-run if imported in browser environment
if (typeof window !== 'undefined') {
  // Make it available globally for browser console
  ;(
    window as unknown as { testNonEphemeralECDH: () => Promise<TestSuiteResult> }
  ).testNonEphemeralECDH = testNonEphemeralECDH
}
