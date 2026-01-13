# Development Notes

## SEA Initialization Delay

### Why It's Needed

When `gun.user().auth()` or `gun.user().create()` completes, it sets up `user.is` with the user's SEA keys (public/private key pair). However, SEA needs additional time to:

1. Load the keys from storage
2. Decrypt the keys (they're stored encrypted)
3. Set up its internal signing state
4. Make the keys ready for signing/encrypting operations

If we immediately try to store data via `user.get('path').put(value)` after authentication, SEA attempts to sign the data but its internal state isn't fully initialized yet. This causes SEA to return an error:

```
Failed to store ephemeral private key: Unverified data
```

### Implementation

We solve this by adding a delay after user authentication before attempting to store ephemeral keys:

- **Location 1:** `createSEAUser()` - After successful user creation via `gun.user().auth()` (line 1192)
- **Location 2:** `createSEAUser()` - When user is already authenticated (no re-auth needed, line N/A - removed from plan)
- **Location 3:** `authenticateSEAUser()` - After successful authentication (line 1389)

### Current Delay Value

- **Constant:** `GunService.SEA_INIT_DELAY_MS = 500` (500ms)
- **Retry Logic:** 1 retry on "Unverified data" errors with 500ms delay
- **Total wait before failure:** 1000ms (500ms initial + 500ms retry)
- **Constant Location:** `src/services/gunService.ts` line 48

### Tuning

If "Unverified data" errors persist, increase `SEA_INIT_DELAY_MS` constant:

- **200ms:** Too short (original attempt, failed)
- **500ms:** Current value (should work in most environments)
- **1000ms:** If 500ms still fails in your environment
- **2000ms:** Maximum reasonable delay (beyond this suggests a deeper issue)

To change: Edit `src/services/gunService.ts` line 48:

```typescript
private static readonly SEA_INIT_DELAY_MS = 1000  // Increase if needed
```

### Why Not Use `await SEA.ready()` or Similar?

GunDB/SEA doesn't provide a reliable "ready" event or promise that we can await. The authentication callbacks (`auth()`, `create()`) resolve when the operation completes, but SEA's internal state may still be initializing. A fixed delay is the most reliable workaround until GunDB provides a better API.

### References

- Issue: Ephemeral keys fail to store with "Unverified data" error
- Affects: `generateAndStoreEphemeralKeys()` in `src/services/gunService.ts`
- First identified: January 12, 2026
- Fix implemented: Configurable delay with single retry logic
- Related tests: `src/services/__tests__/gunService.test.ts`, `src/services/__tests__/encryptionService.test.ts`
