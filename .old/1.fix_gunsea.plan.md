# Plan: Fix ECDH Implementation in GunDB/SEA

## 🎯 Goal

Fix the incorrect and insecure ECDH implementation in `gunService` and
`encryptionService` by adopting the correct patterns defined in `AGENTS.md` and
demonstrated in `testNonEphemeralECDH.ts`. Also, prevent database bloat from
test data.

## 🔥 Critical Issues to Address

1. **Wrong Storage Pattern**: Uses custom app namespace instead of GunDB's standard `profiles` directory.
2. **Incorrect API Design**: Methods require raw keys/epubs instead of user-friendly usernames.
3. **Broken ECDH Pattern**: Uses wrong key combinations for shared secret derivation.
4. **Database Bloat**: Current test patterns bloat the database with test data.

As a result, the current implementation is completely useless.

---

## 🗑️ Phase 1: Remove Incorrect Methods

### **gunService.ts**

- Remove `generateAndStoreEphemeralKeys()`
- Remove `getUserEphemeralPublicKey()`
- Remove `EPair` interface
- Remove all references to these in other files.

---

## ➕ Phase 2: Add Correct Profile Methods

### **gunService.ts**

Add methods to manage user profiles in the standardized `profiles` directory:

- `storeUserProfile(username: string): Promise<void>`: Stores `pub` and `epub` from `user._.sea`.
- `getUserEpub(username: string): Promise<string>`: Retrieves the `epub` for a given username.

---

## 🔧 Phase 3: Fix Service Method Signatures

### **encryptionService.ts**

Update signatures to use the correct key pair (automatically pull `gun.user()._.sea` in body):

- `encryptWithSEA(data: string, recipientEpub: string): Promise<string>`
- `decryptWithSEA(encryptedData: string, senderEpub: string): Promise<string>`

---

## 🏗️ Phase 4: Fix Implementation Logic

### **encryptionService.ts**

- Use `gunService.getUserEpub(username)` to retrieve recipient/sender encryption public keys.
- Use the authenticated user's existing key pair from `gun.user()._.sea`.
- Derive shared secret using `SEA.secret({ epub: recipientEpub }, userPair)`.
- Perform encryption/decryption using the derived secret.

---

## 📝 Phase 5: Update User Creation Flow

### **gunService.ts**

- Modify `createSEAUser()` to automatically call `storeUserProfile()` after successful creation.
- Modify `authenticateSEAUser()` to ensure the profile exists in the `profiles` directory.

---

## 🧪 Phase 6: Fix Tests

### **encryptionService.test.ts**

- Update tests to use usernames instead of raw keys.
- Test the service methods (`encryptWithSEA`/`decryptWithSEA`) directly.
- Ensure round-trip success using authenticated user sessions.
- Add a cleanup step to delete users and data created during the test(s).

### **gunService.test.ts**

- Replace `getUserEphemeralPublicKey` tests with `getUserEpub` tests.
- Add tests to verify profile storage during registration.
- Add a cleanup step to delete users and data created during the test(s).

---

## 🔗 Phase 7: Create Integration Test

### **src/test/keySharingIntegration.test.ts**

Create a new end-to-end integration test that verifies:

1. User registration (automatic profile storage).
2. Key generation for a document.
3. Key sharing between Bob and Alice using `encryptionService.encryptWithSEA(key, aliceEpub)`.
4. Document encryption using the shared key.
5. Key decryption by Alice using `encryptionService.decryptWithSEA(encryptedKey, bobEpub)`.
6. Successful document decryption by Alice.
7. Cleanup step to delete users and data created during the test(s).

---

## Benefits

- **Persistent Identity**: Uses the user's authenticated encryption keys.
- **Standard Discovery**: Uses the `profiles` directory for finding other users' encryption keys.
- **Simplified API**: Developers interact with usernames, while the services handle the cryptographic complexity.
- **No Ephemeral Risk**: Eliminates the generation of insecure, unauthenticated temporary key pairs.
- **Cleanup of Test Data**: Removes the test data upon test completion, preventing database pollution.
