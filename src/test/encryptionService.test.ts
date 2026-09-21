/**
 * Encryption Service Tests
 */

import { encryptionService } from '@/services/encryptionService';
import { gunService } from '@/services/gunService';
import {
  TestRunner,
  printTestSummary,
  type TestSuiteResult,
  sleep,
} from '@/dev/testRunner';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function testDocumentEncryption(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Document Encryption (SEA.encrypt/SEA.decrypt)...\n');

  const runner = new TestRunner('Document Encryption');

  await runner.run('should generate document-specific keys', async () => {
    const keyResult = await encryptionService.generateKey();
    if (!keyResult.success) {
      throw keyResult.error;
    }
  });

  await runner.run('should encrypt document', async () => {
    const keyResult = await encryptionService.generateKey();
    if (!keyResult.success) {
      throw keyResult.error;
    }
    const content = 'test document content';
    const encrypted = await encryptionService.encrypt(content, keyResult.data);
    if (!encrypted.success) {
      throw encrypted.error;
    }
  });

  await runner.run('should decrypt document', async () => {
    const keyResult = await encryptionService.generateKey();
    if (!keyResult.success) {
      throw keyResult.error;
    }
    const key = keyResult.data;
    const content = 'test document content';
    const encrypted = await encryptionService.encrypt(content, key);
    if (!encrypted.success) {
      throw encrypted.error;
    }
    const decrypted = await encryptionService.decrypt(encrypted.data, key);
    if (!decrypted.success) {
      throw decrypted.error;
    }
    if (decrypted.data !== content) {
      throw new Error(
        `Decrypted content mismatch. Expected "${content}", got "${decrypted.data}"`
      );
    }
  });

  await runner.run(
    'should encrypt and decrypt different content correctly',
    async () => {
      const keyResult = await encryptionService.generateKey();
      if (!keyResult.success) {
        throw keyResult.error;
      }
      const key = keyResult.data;
      const content1 = 'First document';
      const content2 = 'Second document';

      const encrypted1 = await encryptionService.encrypt(content1, key);
      const encrypted2 = await encryptionService.encrypt(content2, key);
      if (!encrypted1.success) {
        throw encrypted1.error;
      }
      if (!encrypted2.success) {
        throw encrypted2.error;
      }
      if (encrypted1.data === encrypted2.data) {
        throw new Error(
          'Different content should encrypt to different ciphertexts'
        );
      }

      const decrypted1 = await encryptionService.decrypt(encrypted1.data, key);
      const decrypted2 = await encryptionService.decrypt(encrypted2.data, key);
      if (!decrypted1.success) {
        throw decrypted1.error;
      }
      if (!decrypted2.success) {
        throw decrypted2.error;
      }
      if (decrypted1.data !== content1 || decrypted2.data !== content2) {
        throw new Error('Decrypted content mismatch');
      }
    }
  );

  runner.printResults();
  return runner.getResults();
}

async function testKeySharing(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Key Sharing (SEA ECDH)...\n');

  const runner = new TestRunner('Key Sharing (ECDH)');
  const gun = gunService.getGun();

  if (!gun) {
    throw new Error('GunDB not initialized - cannot test ECDH key sharing');
  }

  await runner.run(
    'SEA ECDHE sanity check: it should work without persistent key pairs',
    async () => {
      const sea = encryptionService.sea;
      if (!sea) {
        throw new Error('SEA not initialized');
      }
      const pair1 = await sea.pair();
      const pair2 = await sea.pair();
      // sea.secret() requires an {epub} key object — a bare epub string
      // hits the runtime guard and returns null.
      const sharedKey1 = await sea.secret({ epub: pair2.epub }, pair1);
      const sharedKey2 = await sea.secret({ epub: pair1.epub }, pair2);
      if (!sharedKey1 || !sharedKey2) {
        throw new Error('shared key derivation failed: secret() returned null');
      }
      if (sharedKey1.epriv !== sharedKey2.epriv) {
        throw new Error(
          `shared key derivation mismatch: "${sharedKey1.epriv}" != "${sharedKey2.epriv}"`
        );
      }
      const plaintext = 'test 1234';
      // Holster's SEA.encrypt requires an {epriv} key object and returns a
      // {ct, iv, s} cipher object.
      const encrypted = await sea.encrypt(plaintext, sharedKey1);
      if (!encrypted) {
        throw new Error('encryption failed: SEA.encrypt returned null');
      }
      const decrypted = await sea.decrypt(encrypted, sharedKey2);
      if (decrypted !== plaintext) {
        throw new Error(`decryption failed: "${decrypted}" != "${plaintext}"`);
      }
    }
  );

  await runner.run(
    'encrypt and decrypt docKey with SEA ECDH between two users',
    async () => {
      // encryption flow: Bob -> Alice
      const timestamp = Date.now();
      const aliceUsername = `alice_test_ecdh_${timestamp}`;
      const bobUsername = `bob_test_ecdh_${timestamp}`;
      const alicePass = 'password123!Alice';
      const bobPass = 'password123!Bob';

      // create Alice user (profile auto-stored in GunDB profiles directory)
      await gunService.createUser(aliceUsername, alicePass);
      await gunService.authenticateUser(aliceUsername, alicePass);
      await gunService.writeProfile();
      console.log('Alice user created');
      await gunService.logoutAndWait();

      // create Bob user (profile auto-stored in GunDB profiles directory)
      await gunService.createUser(bobUsername, bobPass);
      await gunService.authenticateUser(bobUsername, bobPass);
      await gunService.writeProfile();
      console.log('Bob user created');

      // Bob gets Alice's epub from discovered users
      const aliceUsersResult = await gunService.discoverUsers(aliceUsername);
      if (!aliceUsersResult.success) {
        throw new Error(
          `Failed to discover Alice's profile: ${aliceUsersResult.error.message}`
        );
      }
      const aliceUsers = aliceUsersResult.data;
      assert(aliceUsers.length > 0, "Failed to discover Alice's profile");
      const aliceEpub = aliceUsers[0].data.epub;
      if (typeof aliceEpub !== 'string' || aliceEpub.length === 0) {
        throw new Error("Failed to get Alice's epub from discovered profile");
      }
      console.log(
        `Bob retrieved Alice's epub: ${aliceEpub.substring(0, 20)}...`
      );

      // Bob encrypts document key for Alice (Bob is authenticated)
      const keyResult = await encryptionService.generateKey();
      if (!keyResult.success) {
        throw keyResult.error;
      }
      const docKey = keyResult.data;
      const encryptedKey = await encryptionService.encryptECDH(
        docKey,
        aliceEpub
      );
      console.log('Bob encrypted key for Alice');

      if (!encryptedKey.success) {
        throw encryptedKey.error;
      }
      const encryptedKeyData = encryptedKey.data;

      // switch to Alice
      await gunService.logoutAndWait();
      await gunService.authenticateUser(aliceUsername, alicePass);

      // Alice gets Bob's epub from discovered users
      const bobUsersResult = await gunService.discoverUsers(bobUsername);
      if (!bobUsersResult.success) {
        throw new Error(
          `Failed to discover Bob's profile: ${bobUsersResult.error.message}`
        );
      }
      const bobUsers = bobUsersResult.data;
      assert(bobUsers.length > 0, "Failed to discover Bob's profile");
      const bobEpub = bobUsers[0].data.epub;
      if (typeof bobEpub !== 'string' || bobEpub.length === 0) {
        throw new Error("Failed to get Bob's epub from discovered profile");
      }
      console.log(`Alice retrieved Bob's epub: ${bobEpub.substring(0, 20)}...`);

      // Alice decrypts from Bob (Alice is authenticated)
      const decryptedKey = await encryptionService.decryptECDH(
        encryptedKeyData,
        bobEpub
      );
      console.log('Alice decrypted key from Bob');
      if (!decryptedKey.success) {
        throw decryptedKey.error;
      }
      if (decryptedKey.data !== docKey) {
        throw new Error(
          `key decryption failed: ${docKey} != ${decryptedKey.data}`
        );
      }

      const contentECDH = 'test document for ECDH key sharing';
      const encryptedECDH = await encryptionService.encrypt(
        contentECDH,
        docKey
      );
      if (!encryptedECDH.success) {
        throw encryptedECDH.error;
      }
      const decryptedECDH = await encryptionService.decrypt(
        encryptedECDH.data,
        decryptedKey.data
      );

      if (!decryptedECDH.success) {
        throw decryptedECDH.error;
      }
      if (decryptedECDH.data !== contentECDH) {
        throw new Error(
          'ECDH key sharing failed - decrypted document mismatch'
        );
      }
    }
  );

  runner.printResults();
  return runner.getResults();
}

// async function testErrorHandling(): Promise<TestSuiteResult> {
//   console.log('🧪 Testing Error Handling...\n')

//   const runner = new TestRunner('Error Handling')

//   await runner.run('should throw error when decrypting with wrong key', async () => {
//     const key1 = await encryptionService.generateKey()
//     const key2 = await encryptionService.generateKey()
//     const content = 'test content'
//     const encrypted = await encryptionService.encrypt(content, key1)

//     try {
//       await encryptionService.decrypt(encrypted!, key2)
//       throw new Error('Should have thrown an error for wrong key')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for wrong key') {
//         throw error
//       }
//     }
//   })

//   await runner.run('should throw error when decrypting corrupted data', async () => {
//     const key = await encryptionService.generateKey()
//     const corrupted: any = {
//       encryptedContent: 'invalid-base64!!!',
//       iv: 'invalid',
//       tag: 'invalid',
//     }

//     try {
//       await encryptionService.decrypt(corrupted, key)
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
//       await encryptionService.encrypt('test', invalidKey)
//       throw new Error('Should have thrown an error for invalid key')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for invalid key') {
//         throw error
//       }
//     }
//   })

//   await runner.run('should throw error when operations called before initialization', async () => {
//     const { EncryptionService } = await import('@/services/encryptionService')
//     const uninitializedService = new EncryptionService()
//     const key = await encryptionService.generateKey()

//     try {
//       await uninitializedService.encryptECDH(key, 'some-pub')
//       throw new Error('Should have thrown an error for uninitialized service')
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : String(error)
//       if (errorMessage === 'Should have thrown an error for uninitialized service') {
//         throw error
//       }
//     }

//     try {
//       await uninitializedService.decryptKeyECDH('encrypted', 'epub')
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

export async function testEncryptionService(
  suiteNumber?: number
): Promise<TestSuiteResult[]> {
  console.log('🚀 Starting Encryption Service Tests\n');
  console.log('='.repeat(60));

  const gun = gunService.getGun();
  if (gun) {
    const currentUser = gun.user();
    if (currentUser.is && currentUser.is.pub) {
      console.log(
        `\n📝 Pre-test: User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`
      );
      gun.user().leave();
      await sleep(800);
      console.log('   ✅ Logged out and waited 800ms\n');
    }
  }

  // Ensure GunDB is properly initialized for tests
  if (!gunService.isReady()) {
    console.log('\n📝 Pre-test: GunDB not ready, initializing...\n');
    gunService.initialize();
    await sleep(1000);
    console.log('   ✅ GunDB initialized and waited 1s\n');
  } else {
    console.log('\n📝 Pre-test: GunDB already ready\n');
  }

  // Initialize SEA for encryption tests
  await encryptionService.initializeSEA();
  console.log('   ✅ SEA initialized\n');

  const suiteResults: TestSuiteResult[] = [];

  const docEncResult = await testDocumentEncryption();
  suiteResults.push(docEncResult);
  console.log('\n' + '='.repeat(60) + '\n');

  const keyShareResult = await testKeySharing();
  suiteResults.push(keyShareResult);
  console.log('\n' + '='.repeat(60) + '\n');

  // const errorResult = await testErrorHandling()
  // suiteResults.push(errorResult)
  // console.log('\n' + '='.repeat(60))

  if (gun) {
    const finalUser = gun.user();
    if (finalUser.is && finalUser.is.pub) {
      console.log('\n📝 Cleanup: Logging out test user');
      gun.user().leave();
      await sleep(800);
      console.log('   ✅ Logged out and waited 800ms');
    }
  }

  printTestSummary(
    suiteResults,
    suiteNumber !== undefined ? `SUITE ${suiteNumber}` : undefined
  );

  return suiteResults;
}
