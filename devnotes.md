# Development Notes

## Exponential Backoff Retry Logic for SEA Initialization

### Why Fixed Delays Are Problematic

Fixed delays cause substantial app slowdown:

- User creation always waits same delay regardless of whether SEA is ready
- If SEA initializes quickly, we're unnecessarily waiting
- If SEA needs more time, fixed delay might be insufficient

### Solution: Exponential Backoff with Small Initial Delay

We use exponential backoff retry logic:

- **Start small:** 100ms initial delay (fast if SEA is ready)
- **Progressive retry:** 100ms → 200ms → 400ms → 800ms
- **Maximum 4 attempts:** 1500ms total maximum delay
- **Typical case:** Succeeds on first try (100ms wait)
- **Worst case:** 1500ms total (better than fixed 2000ms)

### Behavior

**Error types that trigger retry:**

- "Unverified data" - SEA not ready, try again
- "Timeout storing ephemeral keys" - GunDB operation timeout, try again

**Error types that do NOT trigger retry:**

- Network errors (throw immediately)
- Authentication errors (wrong password, etc.)
- Storage errors that are not retryable

### Implementation

**Retry Logic Location:** `src/utils/retryHelper.ts`

**Configuration:**

- `maxAttempts: 4` - Maximum retry attempts
- `baseDelay: 100` - Starting delay in milliseconds
- `backoffMultiplier: 2` - Multiplier for exponential backoff

**Usage with GunDB:**

```typescript
import { retryWithBackoff } from '../utils/retryHelper'

// In createSEAUser() and authenticateSEAUser()
await retryWithBackoff(
  async attempt => {
    await this.generateAndStoreEphemeralKeys(gun)
  },
  {
    maxAttempts: 4,
    baseDelay: 100,
    backoffMultiplier: 2,
  }
)
```

### Retry Schedule

| Attempt | Delay | Cumulative |
| ------- | ----- | ---------- |
| 1       | 100ms | 100ms      |
| 2       | 200ms | 300ms      |
| 3       | 400ms | 700ms      |
| 4       | 800ms | 1500ms     |

**Total maximum delay:** 1500ms

### Benefits Over Fixed Delays

1. **Faster typical case:** 100ms wait instead of 2000ms (20x faster)
2. **Graceful degradation:** Progressive retries for problematic cases
3. **No excessive waiting:** Maximum 1500ms total (vs 2000ms fixed)

### Previous Attempts

| Approach                | Delay      | Result                  |
| ----------------------- | ---------- | ----------------------- |
| 200ms fixed + 1 retry   | 400ms      | Too short, still failed |
| 1000ms fixed + 1 retry  | 2000ms     | Works but excessive     |
| **Exponential backoff** | 100-1500ms | **Best of both worlds** |

### References

- Issue: Ephemeral keys fail to store with "Unverified data" and "Timeout storing ephemeral keys" errors
- Affects: `generateAndStoreEphemeralKeys()` in `src/services/gunService.ts`
- First identified: January 12, 2026
- Fix implemented: Exponential backoff retry logic with progressive delays
- Related tests: `src/services/__tests__/gunService.test.ts`, `src/services/__tests__/encryptionService.test.ts`

## GunDB user().auth() Return Value Format

The result of `gun.user().auth()` callback has the following form:

- **On success:** `{ok: int, pub: string}` where `ok` can be 0 on success
- **On failure:** `{err: string, ok: undefined}`

**Important:** The `ok` value can be `0` on success, so code should check for `ack.ok !== undefined` rather than `ack.ok === 1` or truthy checks.
