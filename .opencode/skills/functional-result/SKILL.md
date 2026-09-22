---
name: functional-result
description: >
  Functional error handling with the Result type. Use when you need to chain
  operations that may fail, collect validation errors, convert exception-based
  code to explicit error handling, or work with typed success/failure paths in
  TypeScript. Provides map, mapError, chain, pipe, pipeSync, flow, flowSync,
  tryCatch, tryCatchSync, validate, sequence, traverse, tap, tapError, and
  match/fold for composable error handling.
license: ISC
compatibility: >
  Designed for TypeScript projects. Exported to Claude Code, Cursor, OpenCode,
  and Codex agent platforms via @k98kurz/functional-result.
metadata:
  version: "0.0.4"
  last-updated: "2026-09-07"
  author: "Jonathan Voss"
  library-name: "@k98kurz/functional-result"
  repository: "https://github.com/k98kurz/functional-result"
---

## When to use this library

Use `@k98kurz/functional-result` when:

- Error handling logic is complex or has multiple error paths
- You need to chain multiple operations that may fail
- Error types matter for downstream logic (not just "error occurred")
- You're working with APIs or services that return structured errors
- You need to collect multiple validation errors (not just the first one)
- Converting exception-based code to explicit error handling

**Do NOT use for:**
- Simple try-catch scenarios where exceptions are sufficient
- Performance-critical code where Result allocation overhead matters
- Codebases already committed to a different error-handling paradigm

## Core patterns

Construct results with `success(data)` → `{ success: true, data }` and
`failure(error)` → `{ success: false, error }`.

### Transforming with map (success-only)

Use `map` when the transformation cannot fail:

<!-- example: map-basic -->
```typescript
import { map } from '@k98kurz/functional-result';

const result = success('  hello  ');
const trimmed = map((s: string) => s.trim())(result);
// { success: true, data: 'hello' }

// Failures pass through unchanged
const failed = failure('error');
const unchanged = map((s: string) => s.trim())(failed);
// { success: false, error: 'error' }
```

### Chaining with chain (may fail)

Use `chain` when the transformation returns a Result:

<!-- example: chain-basic -->
```typescript
import { chain, success, failure } from '@k98kurz/functional-result';

const parseAndDouble = (str: string) => {
  const num = Number(str);
  return isNaN(num) ? failure('Invalid number') : success(num * 2);
};

const result = success('5');
const chained = chain(parseAndDouble)(result);
// { success: true, data: 10 }

// chain may return a failure
const abc = success('abc');
const failedChain = chain(parseAndDouble)(abc);
// { success: false, error: 'Invalid number' }
```

### Composing with pipe

Use `pipe` for readable operation chains. Failures skip subsequent operations:

<!-- example: pipe-composition -->
```typescript
import { pipe, map, chain } from '@k98kurz/functional-result';

const processInput = await pipe(
  success('  5  '),
  map(s => s.trim()),
  map(s => parseInt(s, 10)),
  chain(n => isNaN(n) ? failure('Invalid number') : success(n)),
  map(n => n * 2)
);
// Result: { success: true, data: 10 }

// If any operation fails, subsequent operations no-op in effect
const processInvalid = await pipe(
  success('abc'),
  map(s => s.trim()),
  map(s => parseInt(s, 10)),
  chain(n => isNaN(n) ? failure('Invalid number') : success(n)),
  map(n => n * 2)
);
// Result: { success: false, error: 'Invalid number' }
```

`pipe` always returns a `Promise`, even for all-sync operations. For pure
synchronous flows, use `pipeSync` — the same flat, left-to-right shape, but it
returns the final `Result` directly with no `Promise` wrapper. The curried
combinators (`map`, `chain`, ...) also compose directly, without `pipe` at all.

### Reusable pipelines with flow / flowSync

`pipe` and `pipeSync` are data-first: the initial value seeds type inference at
the call site. To define a pipeline once and apply it to data that arrives
later, use `flow` (async or mixed steps, returns a `Promise`) or `flowSync`
(sync steps only, returns the `Result` directly). No data is in scope at
definition time, so annotate callbacks there and follow the flow-annotation
rules in Gotchas below (`<E>` generics on pass-through ops, per-application
narrowing).

### Side effects with tap and tapError

Both are curried and return the original Result unchanged, making them safe in
pipelines: `tap(fn)` runs on successes, `tapError(fn)` on failures — failures
skip success taps and vice versa.

## Migration from exception-based code

### Pattern 1: Wrap existing code with tryCatch

Use `tryCatch` for operations that may be async or sync; for synchronous-only
operations where you want to avoid Promise overhead, use `tryCatchSync` (same
signature, no `Promise`):

<!-- example: try-catch -->
```typescript
import { tryCatch } from '@k98kurz/functional-result';

const sometimesThrows = (): unknown => {
  const input = Math.random() < 0.5 ? '{"valid": true}' : 'not json';
  return JSON.parse(input);
};

// Wrap synchronous operations
const syncResult = await tryCatch(() => {
  const data = JSON.parse('{"valid": true}');
  return data.valid;
});
// { success: true, data: true }

// Wrap asynchronous operations
const asyncResult = await tryCatch(async () => {
  const response = await fetch('https://api.example.com');
  return response.json();
});
// Result depends on fetch success/failure

// Transform errors for better context
const result = await tryCatch(
  () => sometimesThrows(),
  (error) =>
    `Operation failed: ${error instanceof Error ? error.message : String(error)}`
);
```

### Pattern 2: Converting existing error handling

**Before (exception-based):**
<!-- example: skill-conversion-before -->
```typescript
function getUser(id: number): User {
  const user = db.find(id);
  if (!user) throw new Error('User not found');
  return user;
}

function getPosts(user: User): Post[] {
  return db.posts.filter(p => p.userId === user.id);
}

function getUserPosts(id: number): Post[] | undefined {
  try {
    const user = getUser(id);
    const posts = getPosts(user);
    return posts;
  } catch (error) {
    handleError(error);
  }
}
```

**After (Result-based):**
<!-- example: skill-conversion-after -->
```typescript
import { pipe, chain, match, success, failure } from '@k98kurz/functional-result';

function getUser(id: number): Result<User, string> {
  const user = db.find(id);
  return user ? success(user) : failure('User not found');
}

function getPosts(user: User): Result<Post[], string> {
  return success(db.posts.filter(p => p.userId === user.id));
}

async function somePipeline() {
  const result = await pipe(
    success(1),
    chain(getUser),
    chain(getPosts)
  );

  return match(
    (posts) => posts,
    (error) => handleError(error)
  )(result);
}
```

## Working with arrays

### Sequence: Handle arrays of Results

<!-- example: sequence -->
```typescript
import { sequence } from '@k98kurz/functional-result';

const results = [
  success(1),
  success(2),
  success(3)
];

const sequenced = sequence(results);
// { success: true, data: [1, 2, 3] }

// Returns first failure if any operation fails
const withFailure = [
  success(1),
  failure('second failed'),
  success(3)
];

const failed = sequence(withFailure);
// { success: false, error: 'second failed' }
```

### Traverse: Map arrays with functions that return Results

<!-- example: traverse-basic -->
```typescript
import { traverse } from '@k98kurz/functional-result';

const items = ['1', '2', '3'];
const result = traverse((x: string) => {
  const num = Number(x);
  return isNaN(num) ? failure('Invalid') : success(num * 2);
})(items);
// { success: true, data: [2, 4, 6] }
```

## Validation with multiple errors

Use `validate` when you need to collect all validation errors:

<!-- example: validate-basic -->
```typescript
import { validate } from '@k98kurz/functional-result';

const emailValidator = validate([
  (value: string) =>
    value.includes('@') ? null : { field: 'email', message: 'Must contain @' },
  (value: string) =>
    value.length >= 3 ? null : { field: 'email', message: 'Too short' }
]);

const valid = emailValidator('test@example.com');
// { success: true, data: 'test@example.com' }

const invalid = emailValidator('ab');
// { success: false, error: [
//   { field: 'email', message: 'Must contain @' },
//   { field: 'email', message: 'Too short' }
// ]}
```

## Extracting values

### Pattern matching with match/fold

Both are curried. `fold` is an alias of `match` for semantic clarity:

<!-- example: match-fold -->
```typescript
import { match, fold, success } from '@k98kurz/functional-result';

const result = success(42);

const message = match(
  (data: number) => `Success! Got: ${data}`,
  (error: unknown) => `Failed with: ${error}`
)(result);
// 'Success! Got: 42'

// fold is an alias for match with more semantic meaning for final value extraction
const finalValue = fold(
  (data: number) => data.toString(),
  (error: unknown) => 'default value'
)(result);
// '42'
```

### Default values with getOrElse

`getOrElse(default)(result)` returns the data on success or the provided
default on failure; the default's type may differ from the success type (see
Gotchas).

### Exiting the Result paradigm with unwrapResult

Use `unwrapResult` (alias: `getOrThrow`) to convert Results back to
exception-based code:

<!-- example: skill-unwrap -->
```typescript
import { unwrapResult } from '@k98kurz/functional-result';

const someFunctionReturnsResult = (): Result<number, Error> => success(1);
const result = someFunctionReturnsResult();

// Throws if result is a failure
const data = unwrapResult(result);

// Use case: integrating with exception-based frameworks
app.get('/users/:id', async (req, res) => {
  const userResult = await getUser(Number(req.params.id));
  const user = unwrapResult(userResult); // throws if not found
  res.json(user);
});
```

When unwrapping results that carry custom error types, convert them to real
`Error` instances with `mapError` first to preserve stack traces.

## Type guards

`isSuccess(result)` and `isFailure(result)` narrow the type in conditionals —
inside the branch, `result.data` or `result.error` is accessible without casts.

## Gotchas

- **Currying style**: Some functions are curried - call them as `fn(args)(result)`, not `fn(args, result)`
  - `map`, `mapError`, `chain`, `match`, `fold`, `traverse`, `validate`, `getOrElse`, `tap`, `tapError`
- **Annotate curried callbacks**: `traverse`, `match`, and `fold` handlers are typed at partial application, before the data is in scope — annotate parameters (`traverse((x: number) => ...)`) or they infer as `unknown`. `sequence(items.map(fn))` types the callback from the array instead. `match`/`fold` branches may return different types and infer as a union (e.g. `match(n => n, e => 'bad')` yields `number | 'bad'`). The same applies to `flow`/`flowSync`: annotate callbacks at definition time, since no data is in scope there either
- **Async pipe**: `pipe` always returns a Promise, even for synchronous operations. For pure sync flows use `pipeSync` (returns the `Result` directly, no `Promise` wrapper); the curried combinators also compose directly without the `Promise` wrapper
- **pipe op limit**: `pipe` provides typed inference through 10 operations. Longer chains compile via a fallback that types the result as `Promise<Result<any, any>>`; the first 10 operations are still type-checked (a mismatch among them is a compile error) and only operations beyond the tenth are unchecked. `pipeSync` mirrors the same 10-op boundary, falling back to `Result<any, any>`
- **Dynamic composition**: to compose an array of operations built at runtime, use `pipe.untyped(start, ...fns)` — it accepts any number of operations with no step typing, returning `Promise<Result<any, any>>`; `pipe` itself rejects a spread array, as do `flow` and `flowSync`. For sync-only flows, `pipeSync.untyped` is the synchronous equivalent, returning `Result<any, any>`
- **Reusable pipelines**: to define a pipeline once and apply it later, use `flow(...ops)` (mixed or async steps, returns a `Promise`) or `flowSync(...ops)` (sync only, returns the `Result` directly). Their input error type stays generic until application; both mirror the 10-op typed cutoff of `pipe`/`pipeSync`
- **flow op annotations**: ops in a reusable flow need permissive input-error annotations — `unknown` on a pass-through op silently widens its output error channel to `unknown`, so prefer a generic `<E>`; a `mapError((e: SomeLiteral) => ...)` narrows `E` and belongs per-application; partial explicit type args are unsupported (`flow<User, E>(...)` is a compile error) — annotate the first op's callback instead
- **tryCatch vs tryCatchSync**: Use `tryCatch` for async or unknown operations; use `tryCatchSync` for sync-only to avoid Promise overhead
- **Validation error format**: `validate` requires `ValidationError` interface: `{ field: string; message: string }`
- **Array operations**: `sequence` stops at first failure; use `partitionResults` if you need all failures. `sequence`, `traverse`, and `partitionResults` accept `readonly` arrays, and `validate` accepts a `readonly` array of validators. A mixed array whose elements carry different success or error types can't be inferred as one `Result<T, E>` — pre-annotate it as `Result<T, E1 | E2>[]` or build it with `items.map(fn)` / `traverse`
- **map vs chain**: use `chain` when the operation returns a Result — `map` would nest (`Result<Result<number, E>, E>`). Use `mapError` to transform error values, not `map` (which only transforms success values); a `mapError`/`tapError` handler must cover the full union of errors it may encounter
- **getOrElse defaults**: `getOrElse(defaultValue)` returns `T | D`, so the default need not match the success type exactly (e.g. `getOrElse(null)` on `Result<string | null, E>`)
- **Error widening**: `chain` unions its step's errors with the input's (`Result<T, E>` + step returning `Result<U, F>` → `Result<U, E | F>`); `map` and `tap` preserve the input error type
- **Error propagation**: `pipe` invokes every operation even after a failure — `map`/`chain`/`tap` no-op on a failed Result (while `mapError`/`tapError` still run), which makes steps *appear* skipped
- **Default error type**: `Result<T, E>` defaults `E` to `unknown`; `success(x)` types as `Result<T, never>`, which is assignable to any error type
- **Do NOT nest pipes**: nested calls bypass the typed overloads (ops degrade to `Result<any, any>`) and add needless Promise layers; to carry multiple values across steps, thread a state object (e.g. `{ user, orders }`) — use `map` to update it and `chain` for fallible steps

## Common templates

### API call wrapper

<!-- example: skill-api-call-wrapper -->
```typescript
import { tryCatch, map } from '@k98kurz/functional-result';

const fetchApi = async <T>(url: string): Promise<Result<T, string>> => {
  return await tryCatch(
    async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json() as T;
    },
    (error) =>
      `API request failed: ${error instanceof Error
        ? error.message
        : String(error)}`
  );
};
```

### Validation pipeline

<!-- example: skill-validation-pipeline -->
```typescript
import { pipe, validate, map, chain } from '@k98kurz/functional-result';

const validateAndProcessUser = (input: unknown) => {
  return pipe(
    success(input),
    chain(validateUser), // Returns Result<ValidatedUser, ValidationError[]>
    map(addDefaults),    // Cannot fail, so use map
    chain(saveToDb)      // May fail, so use chain
  );
};
```

### Partial batch processing (partitionResults)

<!-- example: skill-batch-processing -->
```typescript
import { partitionResults } from '@k98kurz/functional-result';

const processBatch = (items: string[]) => {
  // Map each item to a Result
  const outcomes = items.map(processItem);

  // Collect successes and failures separately
  const { successes, failures } = partitionResults(outcomes);

  // Report results
  return {
    succeeded: successes.length,
    failed: failures.length,
    errors: failures,
    data: successes
  };
};
```

## Progressive Disclosure

This skill includes reference files. Load these when needed:

- **Load `references/composition.md` when** defining a reusable `flow`/`flowSync` pipeline, composing a pure-sync pipeline with `pipeSync`, or when a flow's error type collapses to `unknown`
- **Load `references/changelog.md` when** checking what changed in the most recent releases or reviewing breaking changes before upgrading
