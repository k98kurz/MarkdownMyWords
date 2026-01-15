/**
 * Encryption Service Tests
 */

import { encryptionService } from '../services/encryptionService'
import { gunService } from '../services/gunService'
import { TestRunner, printTestSummary, type TestSuiteResult, sleep } from '../utils/testRunner'
// import { retryWithBackoff } from '../../utils/retryHelper'

const assert = (condition: any, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

async function testDocumentEncryption(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Document Encryption (SEA.encrypt/SEA.decrypt)...\n')

  const runner = new TestRunner('Document Encryption')

  await runner.run('should generate document-specific keys', async () => {
    const key = await encryptionService.generateDocumentKey()
    assert(key, 'key not generated')
  })

  await runner.run('should encrypt document', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content = 'test document content'
    const encrypted = await encryptionService.encryptDocument(content, key)
    assert(encrypted, 'document encryption failed')
  })

  await runner.run('should decrypt document', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content = 'test document content'
    const encrypted = await encryptionService.encryptDocument(content, key)
    assert(typeof encrypted === 'string', 'encryption failed')
    const decrypted = await encryptionService.decryptDocument(encrypted!, key)
    assert(
      decrypted == content,
      `Decrypted content mismatch. Expected "${content}", got "${decrypted}"`
    )
  })

  await runner.run('should encrypt and decrypt different content correctly', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content1 = 'First document'
    const content2 = 'Second document'

    const encrypted1 = await encryptionService.encryptDocument(content1, key)
    const encrypted2 = await encryptionService.encryptDocument(content2, key)

    if (encrypted1 === encrypted2) {
      throw new Error('Different content should encrypt to different ciphertexts')
    }

    const decrypted1 = await encryptionService.decryptDocument(encrypted1!, key)
    const decrypted2 = await encryptionService.decryptDocument(encrypted2!, key)

    if (decrypted1 !== content1 || decrypted2 !== content2) {
      throw new Error('Decrypted content mismatch')
    }
  })

  runner.printResults()
  return runner.getResults()
}

async function testKeySharing(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Key Sharing (SEA ECDH)...\n')

  const runner = new TestRunner('Key Sharing (ECDH)')
  const gun = gunService.getInstance()

  if (!gun) {
    throw new Error('GunDB not initialized - cannot test ECDH key sharing')
  }

  await runner.run(
    'SEA ECDHE sanity check: it should work without persistent key pairs',
    async () => {
      const pair1 = await encryptionService.sea?.pair()
      const pair2 = await encryptionService.sea?.pair()
      const sharedKey1 = await encryptionService.sea?.secret(pair2!.epub, pair1!)
      const sharedKey2 = await encryptionService.sea?.secret(pair1!.epub, pair2!)
      assert(
        sharedKey1 == sharedKey2,
        `shared key derivation failed: ${sharedKey1} != ${sharedKey2}`
      )
      const plaintext = 'test 1234'
      const encrypted = await encryptionService.sea?.encrypt(plaintext, sharedKey1!)
      const decrypted = await encryptionService.sea?.decrypt(encrypted!, sharedKey2!)
      assert(decrypted == plaintext, `decryption failed: "${decrypted}" != "${plaintext}"`)
    }
  )

  await runner.run('encrypt and decrypt docKey with SEA ECDH between two users', async () => {
    // encryption flow: Bob -> Alice
    const timestamp = Date.now()
    const aliceUsername = `alice_test_ecdh_${timestamp}`
    const bobUsername = `bob_test_ecdh_${timestamp}`
    const alicePass = 'password123!Alice'
    const bobPass = 'password123!Bob'

    // create Alice user (profile auto-stored in GunDB profiles directory)
    const aliceUser = await gunService.createSEAUser(aliceUsername, alicePass)
    assert(aliceUser, 'creating Alice user failed')
    console.log('Alice user created')

    await gunService.logoutAndWait()

    // create Bob user (profile auto-stored in GunDB profiles directory)
    const bobUser = await gunService.createSEAUser(bobUsername, bobPass)
    assert(bobUser, 'creating Bob user failed')
    console.log('Bob user created')

    // Bob gets Alice's epub from profiles directory
    const aliceEpub = await gunService.getUserEpub(aliceUsername)
    assert(aliceEpub, "Failed to get Alice's epub from profiles")
    console.log(`Bob retrieved Alice's epub: ${aliceEpub.substring(0, 20)}...`)

    // Bob encrypts document key for Alice (Bob is authenticated)
    const docKey = await encryptionService.generateDocumentKey()
    const encryptedKey = await encryptionService.encryptWithSEA(docKey, aliceEpub)
    console.log('Bob encrypted key for Alice')

    if (!encryptedKey) {
      throw new Error('Encryption failed - missing encrypted key')
    }

    // switch to Alice
    await gunService.logoutAndWait()
    await sleep(500)
    await gunService.authenticateSEAUser(aliceUsername, alicePass)
    await sleep(1000)

    // Alice gets Bob's epub from profiles directory
    const bobEpub = await gunService.getUserEpub(bobUsername)
    assert(bobEpub, "Failed to get Bob's epub from profiles")
    console.log(`Alice retrieved Bob's epub: ${bobEpub.substring(0, 20)}...`)

    // Alice decrypts from Bob (Alice is authenticated)
    const decryptedKey = await encryptionService.decryptWithSEA(encryptedKey, bobEpub)
    console.log('Alice decrypted key from Bob')
    assert(docKey == decryptedKey, `key decryption failed: ${docKey} != ${decryptedKey}`)

    const content = 'test document for ECDH key sharing'
    const encrypted = await encryptionService.encryptDocument(content, docKey)
    const decrypted = await encryptionService.decryptDocument(encrypted!, decryptedKey!)

    if (decrypted !== content) {
      throw new Error('ECDH key sharing failed - decrypted document mismatch')
    }
  })

  runner.printResults()
  return runner.getResults()
}

// async function testErrorHandling(): Promise<TestSuiteResult> {
//   console.log('🧪 Testing Error Handling...\n')

//   const runner = new TestRunner('Error Handling')

//   await runner.run('should throw error when decrypting with wrong key', async () => {
//     const key1 = await encryptionService.generateDocumentKey()
//     const key2 = await encryptionService.generateDocumentKey()
//     const content = 'test content'
//     const encrypted = await encryptionService.encryptDocument(content, key1)

//     try {
//       await encryptionService.decryptDocument(encrypted!, key2)
//       throw new Error('Should have thrown an error for wrong key')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for wrong key') {
//         throw error
//       }
//     }
//   })

//   await runner.run('should throw error when decrypting corrupted data', async () => {
//     const key = await encryptionService.generateDocumentKey()
//     const corrupted: any = {
//       encryptedContent: 'invalid-base64!!!',
//       iv: 'invalid',
//       tag: 'invalid',
//     }

//     try {
//       await encryptionService.decryptDocument(corrupted, key)
//       throw new Error('Should have thrown an error for corrupted data')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for corrupted data') {
//         throw error
//       }
//     }
//   })

//   await runner.run('should throw error when encrypting without valid key', async () => {
//     const invalidKey = await encryptionService.exportKey(
//       await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['decrypt'])
//     )

//     try {
//       await encryptionService.encryptDocument('test', invalidKey)
//       throw new Error('Should have thrown an error for invalid key')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for invalid key') {
//         throw error
//       }
//     }
//   })

//   await runner.run('should throw error when operations called before initialization', async () => {
//     const { EncryptionService } = await import('../encryptionService')
//     const uninitializedService = new EncryptionService()
//     const key = await encryptionService.generateDocumentKey()

//     try {
//       await uninitializedService.encryptWithSEA(key, 'some-pub')
//       throw new Error('Should have thrown an error for uninitialized service')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for uninitialized service') {
//         throw error
//       }
//     }

//     try {
//       await uninitializedService.decryptDocumentKeyWithSEA('encrypted', 'epub')
//       throw new Error('Should have thrown an error for uninitialized service')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for uninitialized service') {
//         throw error
//       }
//     }
//   })

//   runner.printResults()
//   return runner.getResults()
// }

export async function testEncryptionService(): Promise<void> {
  console.log('🚀 Starting Encryption Service Tests\n')
  console.log('='.repeat(60))

  const gun = gunService.getInstance()
  if (gun) {
    const currentUser = gun.user()
    if (currentUser.is && currentUser.is.pub) {
      console.log(
        `\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`
      )
      gun.user().leave()
      await sleep(800)
      console.log('   ✅ Logged out and waited 800ms\n')
    }
  }

  // Ensure GunDB is properly initialized for tests
  if (!gunService.isReady()) {
    console.log('\n📝 Pre-test: GunDB not ready, initializing...\n')
    gunService.initialize()
    await sleep(1000)
    console.log('   ✅ GunDB initialized and waited 1s\n')
  } else {
    console.log('\n📝 Pre-test: GunDB already ready\n')
  }

  const suiteResults: TestSuiteResult[] = []

  // const docEncResult = await testDocumentEncryption()
  // suiteResults.push(docEncResult)
  // console.log('\n' + '='.repeat(60) + '\n')

  const keyShareResult = await testKeySharing()
  suiteResults.push(keyShareResult)
  console.log('\n' + '='.repeat(60) + '\n')

  // const errorResult = await testErrorHandling()
  // suiteResults.push(errorResult)
  // console.log('\n' + '='.repeat(60))

  if (gun) {
    const finalUser = gun.user()
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user')
      gun.user().leave()
      await sleep(800)
      console.log('   ✅ Logged out and waited 800ms')
    }
  }

  printTestSummary(suiteResults)
}
