/**
 * Test Non-Ephemeral Public Key ECDH
 *
 * This test attempts to use a user's non-ephemeral public key (user.is.pub)
 * as the receiver key for ECDH encryption with SEA.
 * The sender uses an ephemeral key pair, but the receiver uses their
 * non-ephemeral key pair.
 *
 * Based on SEA.secret() API:
 * - First param: recipient's epub (string or { epub: string })
 * - Second param: sender's key pair ({ epriv: string, epub: string })
 *
 * This test can be run from the browser console.
 *
 * NOTE: the conclusion of testing is that the non-ephemeral public key cannot
 * be used for ECDH.
 */

import Gun from 'gun';
import 'gun/sea';
import { gunService } from '../gunService';


/**
 * Test ECDH encryption using non-ephemeral public key as receiver
 */
export async function testNonEphemeralECDH(): Promise<void> {
  console.log('🧪 Testing Non-Ephemeral Public Key ECDH with SEA\n');
  console.log('='.repeat(60));
  console.log('Testing if SEA.secret() accepts non-ephemeral pub/priv keys');
  console.log('where ephemeral epub/epriv keys are expected.\n');

  try {
    // Ensure services are initialized
    if (!gunService.isReady()) {
      gunService.initialize();
    }

    const gun = gunService.getInstance();
    if (!gun) {
      throw new Error('GunDB instance not available');
    }

    const SEA = Gun.SEA;
    if (!SEA) {
      throw new Error('SEA not available');
    }

    // Check if a user is already logged in and log them out
    console.log('\n📝 Pre-test: Check for existing user session');
    const currentUser = gun.user();
    if (currentUser.is && currentUser.is.pub) {
      console.log(`   ⚠️  User already logged in (${currentUser.is.pub.substring(0, 20)}...), logging out...`);
      gun.user().leave();
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log('   ✅ Logged out and waited 500ms');
    } else {
      console.log('   ✅ No user logged in');
    }

    // Test 1: Create/authenticate a user to get their non-ephemeral pub/priv keys
    console.log('\n📝 Test 1: Create/Authenticate User to Get Non-Ephemeral Keys');
    const testUsername = `test-user-${Date.now()}`;
    const testPassword = 'test-password-123';

    console.log(`   Creating user: ${testUsername}`);

    await new Promise<void>((resolve, reject) => {
      gun.user().create(testUsername, testPassword, (ack: unknown) => {
        const ackObj = ack as { err?: unknown };
        if (ackObj.err) {
          console.log(`   ⚠️  User might already exist, trying to authenticate...`);
          gun.user().auth(testUsername, testPassword, (authAck: unknown) => {
            const authAckObj = authAck as { err?: unknown };
            if (authAckObj.err) {
              reject(new Error(`Authentication failed: ${String(authAckObj.err)}`));
              return;
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });

    // Wait a bit for user state to be set
    await new Promise((resolve) => setTimeout(resolve, 500));

    const user = gun.user();

    if (!user.is || !user.is.pub) {
      throw new Error('User authentication failed - no pub key available');
    }

    const userNonEphemeralPub = user.is.pub;
    const authenticatedUser = user.is; // This is the user pair object we can pass to SEA.secret()

    console.log(`   ✅ User authenticated`);
    console.log(`   📋 Non-ephemeral pub key: ${userNonEphemeralPub.substring(0, 20)}...`);
    console.log(`   📋 User object available: ${!!authenticatedUser}`);

    // Test 2: Create an ephemeral key pair for the sender
    console.log('\n📝 Test 2: Create Ephemeral Key Pair for Sender');
    const senderEphemeralPair = await SEA.pair();
    if (!senderEphemeralPair || !senderEphemeralPair.epriv || !senderEphemeralPair.epub) {
      throw new Error('Failed to generate ephemeral key pair');
    }

    console.log(`   ✅ Ephemeral key pair generated`);
    console.log(`   📋 Sender ephemeral pub: ${senderEphemeralPair.epub.substring(0, 20)}...`);

    // Test 3: Attempt ECDH using non-ephemeral pub as receiver (sender's perspective)
    console.log('\n📝 Test 3: Sender Side - Attempt ECDH with Non-Ephemeral Pub as Receiver');
    console.log('   API: SEA.secret(recipientPub, senderEphemeralPair)');
    console.log('   Testing: SEA.secret(userNonEphemeralPub, senderEphemeralPair)');

    let senderSharedSecret: unknown;
    try {
      // Try using the non-ephemeral pub directly as string
      senderSharedSecret = await SEA.secret(userNonEphemeralPub, senderEphemeralPair);
      if (senderSharedSecret) {
        console.log('   ✅ Shared secret derived successfully!');
        console.log(`   📋 Shared secret type: ${typeof senderSharedSecret}`);
      } else {
        console.log('   ❌ Shared secret is null/undefined');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed to derive shared secret: ${errorMessage}`);
      console.log('   ℹ️  SEA.secret() may require ephemeral keys (epub) for the recipient');
    }

    // Test 4: Alternative - try with epub format object
    console.log('\n📝 Test 4: Sender Side - Alternative Format');
    console.log('   Testing: SEA.secret({ epub: userNonEphemeralPub }, senderEphemeralPair)');

    let senderSharedSecretAlt: unknown;
    try {
      senderSharedSecretAlt = await SEA.secret(
        { epub: userNonEphemeralPub },
        senderEphemeralPair
      );
      if (senderSharedSecretAlt) {
        console.log('   ✅ Shared secret derived with epub format!');
        console.log(`   📋 Shared secret type: ${typeof senderSharedSecretAlt}`);
      } else {
        console.log('   ❌ Shared secret is null/undefined');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${errorMessage}`);
    }

    // Test 5: Receiver side - attempt to derive same secret using authenticated user object
    if (senderSharedSecret || senderSharedSecretAlt) {
      console.log('\n📝 Test 5: Receiver Side - Derive Shared Secret');
      console.log('   API: SEA.secret({ epub: senderEpub }, userPair)');
      console.log('   Testing: SEA.secret({ epub: senderEpub }, authenticatedUser)');
      console.log('   (Testing if non-ephemeral keys work for ECDH - expected to fail)');

      const workingSecret = senderSharedSecret || senderSharedSecretAlt;
      const senderEpub = senderEphemeralPair.epub;

      // Check if authenticatedUser has the required properties for SEA.secret()
      // SEA.secret() requires { epriv: string, epub: string }
      const userObj = authenticatedUser as Record<string, unknown>;
      const hasEpriv = 'epriv' in userObj && typeof userObj.epriv === 'string';
      const hasEpub = 'epub' in userObj && typeof userObj.epub === 'string';

      if (!hasEpriv || !hasEpub) {
        console.log('   ⚠️  User object does not have required epriv/epub properties');
        console.log('   ℹ️  This confirms that non-ephemeral keys (pub/priv) cannot be used for ECDH');
        console.log('   ℹ️  SEA.secret() requires ephemeral keys (epriv/epub) on both sides');
      } else {
        try {
          // Create a properly typed pair object from the user object
          const userPair = {
            epriv: userObj.epriv as string,
            epub: userObj.epub as string,
          };

          const receiverSharedSecret = await SEA.secret(
            { epub: senderEpub },
            userPair
          );

          if (!receiverSharedSecret) {
            console.log('   ❌ Failed to derive shared secret from receiver side');
          } else {
            console.log('   ✅ Shared secret derived from receiver side!');
            console.log(`   📋 Shared secret type: ${typeof receiverSharedSecret}`);

            // Test 6: Encryption/Decryption round-trip
            console.log('\n📝 Test 6: Encryption/Decryption Round-Trip');
            const testMessage = 'Hello, this is a test message for non-ephemeral ECDH!';

            try {
              // Encrypt with sender's shared secret
              const encrypted = await SEA.encrypt(testMessage, workingSecret as string);
              console.log(`   ✅ Message encrypted with sender secret`);

              // Decrypt with receiver's shared secret
              const decrypted = await SEA.decrypt(encrypted, receiverSharedSecret as string);
              console.log(`   ✅ Message decrypted with receiver secret`);
              console.log(`   📋 Decrypted: ${decrypted}`);

              if (decrypted === testMessage) {
                console.log('   ✅✅✅ SUCCESS: Non-ephemeral ECDH encryption/decryption works!');
              } else {
                console.log('   ❌ Decrypted message does not match original');
                console.log(`   Expected: ${testMessage}`);
                console.log(`   Got: ${decrypted}`);
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.log(`   ❌ Encryption/decryption failed: ${errorMessage}`);
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`   ❌ Failed to derive receiver secret: ${errorMessage}`);
          console.log('   ℹ️  SEA.secret() requires ephemeral keys (epriv/epub) for ECDH');
          console.log('   ℹ️  Non-ephemeral keys (pub/priv) cannot be used for ECDH key exchange');
        }
      }
    } else {
      console.log('\n📝 Test 5: Skipped (sender shared secret not available)');
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Non-ephemeral ECDH test complete!');
    console.log('\n📋 Summary:');
    console.log('   - User non-ephemeral pub/priv keys were obtained');
    console.log('   - Sender ephemeral key pair was generated');
    console.log('   - ECDH was attempted with non-ephemeral pub as receiver');
    console.log('   - Check results above to see if SEA accepts non-ephemeral keys');

    // Final cleanup: Log out the test user
    console.log('\n📝 Cleanup: Logging out test user');
    const finalUser = gun.user();
    if (finalUser.is && finalUser.is.pub) {
      gun.user().leave();
      console.log('   ✅ Logged out');
    } else {
      console.log('   ℹ️  No user to log out');
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Test failed:', errorMessage);

    // Try to log out even if test failed
    try {
      const gun = gunService.getInstance();
      if (gun) {
        const finalUser = gun.user();
        if (finalUser.is && finalUser.is.pub) {
          gun.user().leave();
          console.log('   ✅ Logged out after error');
        }
      }
    } catch {
      // Ignore logout errors during cleanup
    }

    throw error;
  }
}
