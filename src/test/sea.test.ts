import Gun, { ISEAPair } from 'gun';
import 'gun/sea';
import { gunService } from '../services';

/**
 * Assert helper for tests
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Helper to wait for a promise with timeout
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper to create a GunDB user
 */
function createUser(gun: ReturnType<typeof Gun>, username: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    gun.user().create(username, password, (ack: unknown) => {
      const ackObj = ack as { err?: unknown; ok?: number };
      if (ackObj.err) {
        reject(new Error(`Failed to create user ${username}: ${String(ackObj.err)}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Pure SEA ECDH test with GunDB users
 */
export async function testPureSEA(): Promise<void> {
  console.log('🧪 Testing Pure SEA ECDH Key Exchange and Encryption with GunDB Users\n');
  console.log('='.repeat(60));

  // Check that SEA is available
  const SEA = Gun.SEA;
  assert(SEA, 'SEA is not available. Make sure gun/sea is imported.');

  const gun = gunService.getGun()

  try {
    // Step 1: Create user Alice and get her key pair
    console.log('Step 1: Creating user Alice...');
    const aliceUsername = `alice_${Math.random().toString(36).substring(7)}`;
    const alicePassword = 'alice_password_123';
    const bobUsername = `bob_${Math.random().toString(36).substring(7)}`;
    const bobPassword = 'bob_password_123';

    await createUser(gun, aliceUsername, alicePassword);
    console.log('  User Alice created')
    await wait(500); // Wait for user state to be set

    const aliceUser = gun.user();
    assert(aliceUser.is && aliceUser.is.pub, 'Alice user not authenticated');
    console.log(`  User Alice authenticated`);
    console.log(`  Alice epub: ${aliceUser.is.epub.substring(0, 20)}...`);

    // Get Alice's key pair from auth callback
    console.log('  Getting Alice key pair from auth...');
    const alicePair1 = gun.user()._.sea;
    assert(alicePair1 && alicePair1.epriv && alicePair1.epub, 'Failed to get Alice key pair from auth');
    console.log(`  Alice key pair retrieved from auth`);
    console.log(`  Alice pub: ${alicePair1.pub.substring(0, 20)}...\n`);


    // Step 2: Logout Alice and create user Bob
    console.log('Step 2: Logging out Alice and creating user Bob...');
    gun.user().leave();
    await wait(500); // Wait for logout to complete

    await createUser(gun, bobUsername, bobPassword);
    await wait(500); // Wait for user state to be set

    const bobUser = gun.user();
    assert(bobUser.is && bobUser.is.epub, 'Bob user not authenticated');
    console.log(`  User Bob created and authenticated`);
    console.log(`  Bob epub: ${bobUser.is.epub.substring(0, 20)}...`);

    // Get Bob's key pair from auth callback
    console.log('  Getting Bob key pair from auth...');
    const bobPair = gun.user()._.sea;
    assert(bobPair && bobPair.epriv && bobPair.epub, 'Failed to get Bob key pair from auth');
    console.log(`  Bob key pair retrieved from auth`);
    console.log(`  Bob epub: ${bobPair.epub.substring(0, 20)}...\n`);

    assert(bobPair != alicePair1, 'alicePair and bobPair are the same for some reason')

    // Step 3: Derive shared secret using Alice's public key and Bob's key pair
    console.log('Step 3: Deriving shared secret (Bob -> Alice)...');
    console.log('  Using Alice\'s pub and Bob\'s key pair');
    const sharedSecret1 = await SEA.secret({epub: alicePair1.epub}, bobPair);

    assert(sharedSecret1, 'Failed to derive shared secret from Alice\'s pub and Bob\'s key pair');
    console.log(`  Shared secret derived: ${sharedSecret1.substring(0, 20)}...\n`);


    // Step 4: Log out Bob, login Alice, derive the shared secret using Bob's public key and Alice's key pair
    console.log('Step 4: Logging out Bob, logging in Alice, and deriving shared secret (Alice -> Bob)...');
    gun.user().leave();
    await wait(500);
    gun.user().auth(aliceUsername, alicePassword);
    await wait(500);
    assert(gun.user().is && gun.user().is.pub, 'Alice user not reauthenticated');
    const alicePair = gun.user()._.sea;
    assert(alicePair && alicePair.epriv && alicePair.epub,
      'Failed to get Alice key pair from auth on 2nd login');
    assert(alicePair1.epub == alicePair.epub && alicePair1.pub == alicePair.pub,
        `alicePair changed between logins: ${JSON.stringify(alicePair1)} != ${JSON.stringify(alicePair)}`)
    console.log('  Using Bob\'s pub and Alice\'s key pair');

    const sharedSecret2 = await SEA.secret({epub: bobPair.epub}, alicePair);
    assert(sharedSecret2, 'Failed to derive shared secret from Bob\'s pub and Alice\'s key pair');
    console.log(`  Shared secret derived: ${sharedSecret2.substring(0, 20)}...\n`);


    // Step 5: Verify both shared secrets are the same
    console.log('Step 5: Verifying shared secrets match...');
    assert(
      sharedSecret1 === sharedSecret2,
      `Shared secrets do not match! Secret1: ${sharedSecret1.substring(0, 20)}..., Secret2: ${sharedSecret2.substring(0, 20)}...`
    );
    console.log('  Both shared secrets match (ECDH working correctly)\n');


    // Step 6: Encrypt a message with the shared secret
    console.log('Step 6: Encrypting message with shared secret...');
    const message = 'Hello from Bob to Alice!';
    const encrypted = await SEA.encrypt(message, sharedSecret1);

    assert(encrypted, 'Failed to encrypt message');
    assert(encrypted !== message, 'Encrypted message should be different from plaintext');
    console.log(`  Message encrypted: "${message}"`);
    console.log(`  Ciphertext: ${encrypted.substring(0, 30)}...\n`);


    // Step 7: Decrypt the ciphertext using the second shared secret
    console.log('Step 7: Decrypting ciphertext with second shared secret...');
    const decrypted = await SEA.decrypt(encrypted, sharedSecret2);

    assert(decrypted, 'Failed to decrypt message');
    assert(
      decrypted === message,
      `Decryption failed! Expected "${message}", got "${decrypted}"`
    );
    console.log(`  Message decrypted: "${decrypted}"\n`);

    // Cleanup: Logout Bob
    gun.user().leave();

    // Test summary
    console.log('='.repeat(60));
    console.log('ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log('\nTest Summary:');
    console.log('  User creation and key pair retrieval (Alice): PASSED');
    console.log('  User creation and key pair retrieval (Bob): PASSED');
    console.log('  ECDH shared secret derivation (Bob -> Alice): PASSED');
    console.log('  Message encryption: PASSED');
    console.log('  ECDH shared secret derivation (Alice -> Bob): PASSED');
    console.log('  Shared secret matching: PASSED');
    console.log('  Message decryption: PASSED');
    console.log('\n Pure SEA test completed successfully!\n');

  } catch (error) {
    // Cleanup on error
    try {
      gun.user().leave();
    } catch {
      // Ignore cleanup errors
    }

    console.error('\nTEST FAILED');
    console.error('='.repeat(60));
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      if (error.stack) {
        console.error(`Stack: ${error.stack}`);
      }
    } else {
      console.error(`Error: ${String(error)}`);
    }
    console.error('='.repeat(60));
    throw error;
  }
}

// Auto-run if imported in browser environment
if (typeof window !== 'undefined') {
  // Make it available globally for browser console
  (window as unknown as { testPureSEA: () => Promise<void> }).testPureSEA = testPureSEA;

  // Auto-run on import (optional - comment out if you want manual execution)
  // testPureSEA().catch(console.error);
}
