<!-- Generated at build time from changelog.md; do not edit. -->
## 0.0.4

- Breaking: explicit type arguments on curried `mapError`, `tapError`, and
  `getOrElse` must be reordered: `mapError<E, F>(fn)`, `tapError<F>(fn)`,
  `getOrElse<D>(default)`. Code passing explicit type arguments breaks; code
  relying on inference is unaffected
- Breaking: `match` and `fold` now take four type arguments `<T, E, R1, R2>`
  instead of three `<T, E, R>` and return `R1 | R2`. Code relying on inference
  is unaffected; code passing explicit type arguments breaks
- `match`/`fold` now infer heterogeneous branch returns as a union: e.g.
  `match(n => n, e => 'bad')(r)` yields `number | 'bad'` instead of a type
  error (previously both branches had to return the same type)
- `pipe` now accepts chains longer than 10 operations: a final overload compiles
  them, falling back to `Promise<Result<any, any>>`. The first 10 operations are
  still type-checked (a mismatch among them is a compile error); only operations
  beyond the tenth are unchecked. (11th operation previously errored at compile.)
- Added `pipe.untyped(initial, ...operations)` for composing a pipeline from a
  runtime-built array of operations (e.g. `pipe.untyped(start, ...ops)`). It
  performs no step-by-step typing, returning `Promise<Result<any, any>>`, while
  still validating that the initial value is a Result. For statically known
  pipelines prefer `pipe`
- Added `pipeSync(initial, ...operations)` — the synchronous twin of `pipe`. It
  composes unary Result-to-Result operations left-to-right and returns the final
  `Result` directly, with no `Promise` wrapper and no `await`. Promise-returning
  operations and a `Promise<Result>` initial are compile errors. Typed through 10
  operations, then a fallback overload types longer chains as `Result<any, any>`
- Added `pipeSync.untyped(initial, ...operations)` for composing a synchronous
  pipeline from a runtime-built array of operations (e.g.
  `pipeSync.untyped(start, ...ops)`). It performs no step-by-step typing,
  returning `Result<any, any>`, while still validating that the initial value is
  a Result
- Added `flow(...operations)` for reusable pipeline composition: it composes
  Result operations into a unary function applied to data later
  (`flow(map(f), chain(g))(result)`), mixing sync and async steps like `pipe`.
  The input error type stays generic until the returned function is applied, so
  one flow works across Results with different error types. Typed through 10
  operations with the same fallback as `pipe`
- Added `flowSync(...operations)` — the synchronous twin of `flow`: sync ops
  only, returning the final `Result` directly with no `Promise` wrapper.
  Promise-returning operations and a `Promise<Result>` passed to the returned
  function are compile errors. Typed through 10 operations, then a fallback
  overload types longer chains as `Result<any, any>`
- Fixed `tryCatch` type inference: promise-returning thunks now bind `T` to the
  awaited value instead of `Promise<T>` (type-level fix, runtime unchanged)
- Fixed curried generics for `chain`, `map`, and `tap`: the error type is no
  longer frozen at partial application. `chain` widens errors, so
  `chain(fnE1)(resultE2)` now yields `Result<U, E1 | E2>` instead of a type
  error; `map` and `tap` no longer collapse the error channel to `unknown`
- `pipe` overloads now track a per-step error type, so `chain` steps may
  introduce new error types mid-pipeline (type-level fix, runtime unchanged)
- `success` now defaults its error type to `never`; `Result<T, never>` is
  assignable to any `Result<T, E>`, so existing assignments keep compiling
- Fixed `mapError` and `tapError` success-channel typing: applying them in
  curried (non-pipe) form no longer collapses the data type to `unknown`
  (`mapError(fn)(result)` now yields `Result<T, F>` and `tapError` preserves
  `E`, even with an unannotated handler)
- `getOrElse` now returns `T | D`, so a default value need not match the
  success type exactly (e.g. `getOrElse(null)` works on `Result<string | null, E>`)
- `sequence`, `traverse`, and `partitionResults` now accept `readonly` arrays;
  `validate` accepts a `readonly` array of validators
- Bundled skill now ships a `references/` directory beside `SKILL.md`;
  `npx export-functional-result-skill` exports the whole directory. The
  references hold a changelog snippet generated at build time (top two
  entries) and a composition reference with full examples for the new
  `pipeSync`/`flow`/`flowSync` APIs; a Progressive Disclosure section in the
  skill routes to them on demand

## 0.0.3

- Improved bundled skill file to document an avoidable anti-pattern

