/**
 * Encryption Service Tests
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { encryptionService } from '../encryptionService'
import { gunService } from '../gunService'
import { TestRunner, printTestSummary, type TestSuiteResult } from '../../utils/testRunner'

const logoutAndWait = async (gun: any) => {
  gun.user().leave()
  await new Promise(resolve => setTimeout(resolve, 200))
}

describe('EncryptionService', () => {
  beforeAll(async () => {
    // Initialize GunDB and SEA before all tests
    // In test environment, disable radisk (IndexedDB) which isn't available in Node.js
    // Also use empty peers array to work offline (no relay needed)
    try {
      gunService.initialize(undefined, {
        radisk: false, // Disable IndexedDB for tests
        localStorage: false, // Disable localStorage for tests
        peers: [], // Work offline - no relay server needed for tests
      })
      await encryptionService.initializeSEA()
    } catch (error) {
      console.warn('GunDB initialization failed in test environment:', error)
      // Some tests can still run without GunDB (manual encryption tests)
    }
  })

  describe('Document Encryption (AES-256-GCM)', () => {
    it('should generate document-specific keys', async () => {
      const key = await encryptionService.generateDocumentKey()
      expect(key).toBeInstanceOf(CryptoKey)
    })

    it('should encrypt document with AES-256-GCM', async () => {
      const key = await encryptionService.generateDocumentKey()
      const content = 'test document content'
      const encrypted = await encryptionService.encryptDocument(content, key)
      expect(encrypted.encryptedContent).toBeTruthy()
      expect(encrypted.iv).toBeTruthy()
      expect(encrypted.tag).toBeTruthy()
    })

    it('should decrypt document with AES-256-GCM', async () => {
      const key = await encryptionService.generateDocumentKey()
      const content = 'test document content'
      const encrypted = await encryptionService.encryptDocument(content, key)
      const decrypted = await encryptionService.decryptDocument(encrypted, key)
      expect(decrypted).toBe(content)
    })

    it('should encrypt and decrypt different content correctly', async () => {
      const key = await encryptionService.generateDocumentKey()
      const content1 = 'First document'
      const content2 = 'Second document'

      const encrypted1 = await encryptionService.encryptDocument(content1, key)
      const encrypted2 = await encryptionService.encryptDocument(content2, key)

      // Encrypted content should be different
      expect(encrypted1.encryptedContent).not.toBe(encrypted2.encryptedContent)

      // But both should decrypt correctly
      const decrypted1 = await encryptionService.decryptDocument(encrypted1, key)
      const decrypted2 = await encryptionService.decryptDocument(encrypted2, key)

      expect(decrypted1).toBe(content1)
      expect(decrypted2).toBe(content2)
    })
  })

  describe('Key Serialization', () => {
    it('should export key to base64 string', async () => {
      const key = await encryptionService.generateDocumentKey()
      const exported = await encryptionService.exportKey(key)
      expect(exported).toBeTruthy()
      expect(typeof exported).toBe('string')
      // Base64 strings should be non-empty
      expect(exported.length).toBeGreaterThan(0)
    })

    it('should import key from base64 string', async () => {
      const originalKey = await encryptionService.generateDocumentKey()
      const exported = await encryptionService.exportKey(originalKey)
      const importedKey = await encryptionService.importKey(exported)

      expect(importedKey).toBeInstanceOf(CryptoKey)
    })

    it('should round-trip key export/import', async () => {
      const originalKey = await encryptionService.generateDocumentKey()
      const content = 'test content for round-trip'

      // Encrypt with original key
      const encrypted = await encryptionService.encryptDocument(content, originalKey)

      // Export and import key
      const exported = await encryptionService.exportKey(originalKey)
      const importedKey = await encryptionService.importKey(exported)

      // Decrypt with imported key - should work
      const decrypted = await encryptionService.decryptDocument(encrypted, importedKey)
      expect(decrypted).toBe(content)
    })

    it('should throw error when importing invalid key string', async () => {
      await expect(encryptionService.importKey('invalid-base64!!!')).rejects.toThrow()
    })
  })

  describe('Key Sharing (SEA ECDH)', () => {
    // Helper to get gun instance
    const getGun = () => gunService.getInstance()

    // Helper to logout and wait
    const logoutAndWait = async (gun: any) => {
      gun.user().leave()
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    it('should encrypt and decrypt document key with SEA ECDH between two users', async () => {
      const gun = getGun()
      if (!gun) {
        throw new Error('GunDB not initialized - cannot test ECDH key sharing')
      }

      // Use unique usernames to avoid conflicts
      const timestamp = Date.now()
      const aliceUsername = `alice_test_ecdh_${timestamp}`
      const bobUsername = `bob_test_ecdh_${timestamp}`

      // Step 1: Create and authenticate Alice
      await gunService.createSEAUser(aliceUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Step 2: Logout Alice
      await logoutAndWait(gun)

      // Step 3: Create and authenticate Bob
      const bob = await gunService.createSEAUser(bobUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Get Bob's ephemeral public key
      const bobEpub = await encryptionService.getUserEphemeralPublicKey(bob.pub)
      if (!bobEpub) {
        throw new Error(`Bob's ephemeral public key not found`)
      }

      // Step 4: Generate document key
      const docKey = await encryptionService.generateDocumentKey()

      // Step 5: Logout Bob, login Alice
      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(aliceUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Step 6: Encrypt document key for Bob using Alice's keys + Bob's epub
      // encryptionService will generate its own ephemeral pair for Alice
      const { encryptedKey, ephemeralPub } = await encryptionService.encryptDocumentKeyWithSEA(
        docKey,
        bobEpub
      )

      expect(encryptedKey).toBeTruthy()
      expect(ephemeralPub).toBeTruthy()
      // ephemeralPub is Alice's ephemeral public key (generated by encryptionService)

      // Step 7: Logout Alice, login Bob
      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(bobUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      // Step 8: Decrypt document key using Bob's keys + Alice's epub
      const decryptedKey = await encryptionService.decryptDocumentKeyWithSEA(
        encryptedKey,
        ephemeralPub // Alice's epub
      )

      expect(decryptedKey).toBeInstanceOf(CryptoKey)

      // Step 9: Verify the decrypted key works for document encryption/decryption
      const content = 'test document for ECDH key sharing'
      const encrypted = await encryptionService.encryptDocument(content, docKey)
      const decrypted = await encryptionService.decryptDocument(encrypted, decryptedKey)

      expect(decrypted).toBe(content)
    })

    it('should fail to decrypt with wrong sender ephemeral public key', async () => {
      const gun = getGun()
      if (!gun) {
        throw new Error('GunDB not initialized - cannot test ECDH key sharing')
      }

      // Use unique usernames
      const timestamp = Date.now()
      const aliceUsername = `alice_test_wrong_${timestamp}`
      const bobUsername = `bob_test_wrong_${timestamp}`

      // Create Alice and Bob
      await gunService.createSEAUser(aliceUsername, 'password123')

      await logoutAndWait(gun)

      await gunService.createSEAUser(bobUsername, 'password123')
      const bobUser = gun.user()
      const bobIs = bobUser.is as any
      const bobEpub = bobIs.epub

      // Generate document key
      const docKey = await encryptionService.generateDocumentKey()

      // Encrypt key for Bob (as Alice)
      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(aliceUsername, 'password123')
      const { encryptedKey } = await encryptionService.encryptDocumentKeyWithSEA(docKey, bobEpub)

      // Try to decrypt with wrong sender epub (should fail)
      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(bobUsername, 'password123')

      // Use a fake/wrong ephemeral pub
      const wrongEpub = 'wrong-epub-key'

      await expect(
        encryptionService.decryptDocumentKeyWithSEA(encryptedKey, wrongEpub)
      ).rejects.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should throw error when decrypting with wrong key', async () => {
      const key1 = await encryptionService.generateDocumentKey()
      const key2 = await encryptionService.generateDocumentKey()
      const content = 'test content'

      const encrypted = await encryptionService.encryptDocument(content, key1)

      // Try to decrypt with wrong key - should fail
      await expect(encryptionService.decryptDocument(encrypted, key2)).rejects.toThrow()
    })

    it('should throw error when decrypting corrupted data', async () => {
      const key = await encryptionService.generateDocumentKey()
      const corrupted: any = {
        encryptedContent: 'invalid-base64!!!',
        iv: 'invalid',
        tag: 'invalid',
      }

      await expect(encryptionService.decryptDocument(corrupted, key)).rejects.toThrow()
    })

    it('should throw error when encrypting without valid key', async () => {
      // Create a key that's not suitable for encryption
      const invalidKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        true,
        ['decrypt'] // Missing 'encrypt' usage
      )

      await expect(
        encryptionService.encryptDocument('test', invalidKey as CryptoKey)
      ).rejects.toThrow()
    })

    it('should throw error when operations called before initialization', async () => {
      // Create a new service instance that hasn't been initialized
      const { EncryptionService } = await import('../encryptionService')
      const uninitializedService = new EncryptionService()

      const key = await encryptionService.generateDocumentKey()

      // These operations require SEA initialization
      await expect(
        uninitializedService.encryptDocumentKeyWithSEA(key, 'some-pub')
      ).rejects.toThrow()

      await expect(
        uninitializedService.decryptDocumentKeyWithSEA('encrypted', 'epub')
      ).rejects.toThrow()
    })
  })
})

async function testDocumentEncryption(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Document Encryption (AES-256-GCM)...\n')

  const runner = new TestRunner('Document Encryption')

  await runner.run('should generate document-specific keys', async () => {
    const key = await encryptionService.generateDocumentKey()
    if (!(key instanceof CryptoKey)) {
      throw new Error('Key is not a CryptoKey instance')
    }
  })

  await runner.run('should encrypt document with AES-256-GCM', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content = 'test document content'
    const encrypted = await encryptionService.encryptDocument(content, key)
    if (!encrypted.encryptedContent || !encrypted.iv || !encrypted.tag) {
      throw new Error('Encrypted document missing required fields')
    }
  })

  await runner.run('should decrypt document with AES-256-GCM', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content = 'test document content'
    const encrypted = await encryptionService.encryptDocument(content, key)
    const decrypted = await encryptionService.decryptDocument(encrypted, key)
    if (decrypted !== content) {
      throw new Error(`Decrypted content mismatch. Expected "${content}", got "${decrypted}"`)
    }
  })

  await runner.run('should encrypt and decrypt different content correctly', async () => {
    const key = await encryptionService.generateDocumentKey()
    const content1 = 'First document'
    const content2 = 'Second document'

    const encrypted1 = await encryptionService.encryptDocument(content1, key)
    const encrypted2 = await encryptionService.encryptDocument(content2, key)

    if (encrypted1.encryptedContent === encrypted2.encryptedContent) {
      throw new Error('Different content should encrypt to different ciphertexts')
    }

    const decrypted1 = await encryptionService.decryptDocument(encrypted1, key)
    const decrypted2 = await encryptionService.decryptDocument(encrypted2, key)

    if (decrypted1 !== content1 || decrypted2 !== content2) {
      throw new Error('Decrypted content mismatch')
    }
  })

  runner.printResults()
  return runner.getResults()
}

async function testKeySerialization(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Key Serialization...\n')

  const runner = new TestRunner('Key Serialization')

  await runner.run('should export key to base64 string', async () => {
    const key = await encryptionService.generateDocumentKey()
    const exported = await encryptionService.exportKey(key)
    if (!exported || typeof exported !== 'string' || exported.length === 0) {
      throw new Error('Key export failed or returned invalid result')
    }
  })

  await runner.run('should import key from base64 string', async () => {
    const originalKey = await encryptionService.generateDocumentKey()
    const exported = await encryptionService.exportKey(originalKey)
    const importedKey = await encryptionService.importKey(exported)

    if (!(importedKey instanceof CryptoKey)) {
      throw new Error('Imported key is not a CryptoKey instance')
    }
  })

  await runner.run('should round-trip key export/import', async () => {
    const originalKey = await encryptionService.generateDocumentKey()
    const content = 'test content for round-trip'

    const encrypted = await encryptionService.encryptDocument(content, originalKey)
    const exported = await encryptionService.exportKey(originalKey)
    const importedKey = await encryptionService.importKey(exported)
    const decrypted = await encryptionService.decryptDocument(encrypted, importedKey)

    if (decrypted !== content) {
      throw new Error('Round-trip failed: decrypted content mismatch')
    }
  })

  await runner.run('should throw error when importing invalid key string', async () => {
    try {
      await encryptionService.importKey('invalid-base64!!!')
      throw new Error('Should have thrown an error for invalid base64')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for invalid base64') {
        throw error
      }
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
    'should encrypt and decrypt document key with SEA ECDH between two users',
    async () => {
      const timestamp = Date.now()
      const aliceUsername = `alice_test_ecdh_${timestamp}`
      const bobUsername = `bob_test_ecdh_${timestamp}`

      await gunService.createSEAUser(aliceUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      await logoutAndWait(gun)

      const bob = await gunService.createSEAUser(bobUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      const bobEpub = await encryptionService.getUserEphemeralPublicKey(bob.pub)
      if (!bobEpub) {
        throw new Error(`Bob's ephemeral public key not found`)
      }

      const docKey = await encryptionService.generateDocumentKey()

      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(aliceUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      const { encryptedKey, ephemeralPub } = await encryptionService.encryptDocumentKeyWithSEA(
        docKey,
        bobEpub
      )

      if (!encryptedKey || !ephemeralPub) {
        throw new Error('Encryption failed - missing encrypted key or ephemeral pub')
      }

      await logoutAndWait(gun)
      await gunService.authenticateSEAUser(bobUsername, 'password123')
      await new Promise(resolve => setTimeout(resolve, 200))

      const decryptedKey = await encryptionService.decryptDocumentKeyWithSEA(
        encryptedKey,
        ephemeralPub
      )

      if (!(decryptedKey instanceof CryptoKey)) {
        throw new Error('Decrypted key is not a CryptoKey')
      }

      const content = 'test document for ECDH key sharing'
      const encrypted = await encryptionService.encryptDocument(content, docKey)
      const decrypted = await encryptionService.decryptDocument(encrypted, decryptedKey)

      if (decrypted !== content) {
        throw new Error('ECDH key sharing failed - decrypted document mismatch')
      }
    }
  )

  await runner.run('should fail to decrypt with wrong sender ephemeral public key', async () => {
    const timestamp = Date.now()
    const aliceUsername = `alice_test_wrong_${timestamp}`
    const bobUsername = `bob_test_wrong_${timestamp}`

    await gunService.createSEAUser(aliceUsername, 'password123')
    await new Promise(resolve => setTimeout(resolve, 200))
    const aliceUser = gun.user()
    const aliceIs = aliceUser.is as any
    const aliceEpub = aliceIs.epub

    await logoutAndWait(gun)

    await gunService.createSEAUser(bobUsername, 'password123')
    await new Promise(resolve => setTimeout(resolve, 200))

    const docKey = await encryptionService.generateDocumentKey()

    await logoutAndWait(gun)
    await gunService.authenticateSEAUser(aliceUsername, 'password123')
    const { encryptedKey } = await encryptionService.encryptDocumentKeyWithSEA(docKey, aliceEpub)

    await logoutAndWait(gun)
    await gunService.authenticateSEAUser(bobUsername, 'password123')

    const wrongEpub = 'wrong-epub-key'

    try {
      await encryptionService.decryptDocumentKeyWithSEA(encryptedKey, wrongEpub)
      throw new Error('Should have thrown an error for wrong sender epub')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for wrong sender epub') {
        throw error
      }
    }
  })

  runner.printResults()
  return runner.getResults()
}

async function testErrorHandling(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Error Handling...\n')

  const runner = new TestRunner('Error Handling')

  await runner.run('should throw error when decrypting with wrong key', async () => {
    const key1 = await encryptionService.generateDocumentKey()
    const key2 = await encryptionService.generateDocumentKey()
    const content = 'test content'
    const encrypted = await encryptionService.encryptDocument(content, key1)

    try {
      await encryptionService.decryptDocument(encrypted, key2)
      throw new Error('Should have thrown an error for wrong key')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for wrong key') {
        throw error
      }
    }
  })

  await runner.run('should throw error when decrypting corrupted data', async () => {
    const key = await encryptionService.generateDocumentKey()
    const corrupted: any = {
      encryptedContent: 'invalid-base64!!!',
      iv: 'invalid',
      tag: 'invalid',
    }

    try {
      await encryptionService.decryptDocument(corrupted, key)
      throw new Error('Should have thrown an error for corrupted data')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for corrupted data') {
        throw error
      }
    }
  })

  await runner.run('should throw error when encrypting without valid key', async () => {
    const invalidKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'decrypt',
    ])

    try {
      await encryptionService.encryptDocument('test', invalidKey as CryptoKey)
      throw new Error('Should have thrown an error for invalid key')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for invalid key') {
        throw error
      }
    }
  })

  await runner.run('should throw error when operations called before initialization', async () => {
    const { EncryptionService } = await import('../encryptionService')
    const uninitializedService = new EncryptionService()
    const key = await encryptionService.generateDocumentKey()

    try {
      await uninitializedService.encryptDocumentKeyWithSEA(key, 'some-pub')
      throw new Error('Should have thrown an error for uninitialized service')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for uninitialized service') {
        throw error
      }
    }

    try {
      await uninitializedService.decryptDocumentKeyWithSEA('encrypted', 'epub')
      throw new Error('Should have thrown an error for uninitialized service')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage === 'Should have thrown an error for uninitialized service') {
        throw error
      }
    }
  })

  runner.printResults()
  return runner.getResults()
}

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
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('   ✅ Logged out and waited 500ms\n')
    }
  }

  const suiteResults: TestSuiteResult[] = []

  const docEncResult = await testDocumentEncryption()
  suiteResults.push(docEncResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const keySerResult = await testKeySerialization()
  suiteResults.push(keySerResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const keyShareResult = await testKeySharing()
  suiteResults.push(keyShareResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const errorResult = await testErrorHandling()
  suiteResults.push(errorResult)
  console.log('\n' + '='.repeat(60))

  if (gun) {
    const finalUser = gun.user()
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user')
      gun.user().leave()
      console.log('   ✅ Logged out')
    }
  }

  printTestSummary(suiteResults)
}
