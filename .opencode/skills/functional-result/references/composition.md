# Composition reference

Full working examples for the composition APIs whose type annotations are easy
to get subtly wrong. The main SKILL.md keeps the prose summaries and gotchas;
this file carries the complete code.

## pipeSync — flat synchronous pipeline

`pipe` always returns a `Promise`, even for all-sync operations. `pipeSync` is
its synchronous twin: the same flat, left-to-right shape, but it returns the
final `Result` directly, with no `Promise` wrapper. The curried combinators
(`map`, `mapError`, `chain`, ...) also compose directly, without `pipe` at all.

<!-- example: pipe-sync-composition -->
```typescript
import {
  chain,
  failure,
  mapError,
  pipeSync,
  success,
} from '@k98kurz/functional-result';
import type { Result } from '@k98kurz/functional-result';

type ParseError = { code: string };
type ApiError = { code: string; message: string };

const parse = (input: string): Result<number, ParseError> => {
  const n = Number(input);
  return isNaN(n) ? failure({ code: 'parse' }) : success(n);
};

const checkRange = (n: number): Result<number, ApiError> =>
  n > 100 ? failure({ code: 'range', message: `${n} is out of range` }) : success(n);

const toApiError = (e: ParseError): ApiError => ({
  code: e.code,
  message: 'Invalid input'
});

const processInput = (input: string): Result<number, ApiError> =>
  pipeSync(
    parse(input),
    mapError(toApiError),
    chain(checkRange)
  );

const result = processInput('21'); // { success: true, data: 21 }
```

## flow — reusable async (or mixed) pipeline

`pipe` and `pipeSync` are data-first: the initial value seeds type inference at
the call site. `flow` defines the pipeline once and applies it to data that
arrives later, mixing sync and async steps like `pipe` and returning a
`Promise`. Its input error type stays generic until the returned function is
applied, so one flow works across Results with different error types.

Since no data is in scope at definition time:

- Annotate callbacks there (`map((u: User) => u.email)`), or they infer as
  `unknown`.
- Keep a hand-written op's input error annotation permissive — a generic `<E>`
  on ops that pass failures through unchanged. Annotating `unknown` widens that
  op's output error channel to `unknown`.
- An op that narrows the incoming error (e.g. `mapError((e: SomeLiteral) => ...)`)
  belongs per-application, not inside the reusable flow.
- Partial explicit type arguments are unsupported (`flow<User, E>(...)` is a
  compile error) — annotate the first op's callback instead.

<!-- example: flow-composition -->
```typescript
import {
  chain,
  failure,
  flow,
  map,
  success,
} from '@k98kurz/functional-result';
import type { Result } from '@k98kurz/functional-result';

type User = { id: number; email: string };
type ApiError = { code: string; message: string };

const sendEmail = (email: string): Result<boolean, ApiError> =>
  email.includes('@')
    ? success(true)
    : failure({ code: 'email', message: 'invalid email' });

const processUser = flow(
  map((u: User) => u.email),
  chain(sendEmail),
  async <E>(r: Result<boolean, E>) =>
    r.success ? success('sent') : r
);

const userA = success({ id: 1, email: 'a@example.com' } as User);
const userB = success({ id: 2, email: 'no-at.example.com' } as User);

const a = await processUser(userA); // { success: true, data: 'sent' }
const b = await processUser(userB);
// { success: false, error: { code: 'email', message: 'invalid email' } }
```

## flowSync — reusable synchronous pipeline

`flowSync` is the synchronous twin of `flow`: sync steps only, returning the
final `Result` directly with no `Promise` wrapper. The same annotation rules as
`flow` apply.

<!-- example: flow-sync-composition -->
```typescript
import {
  chain,
  failure,
  flowSync,
  map,
  success,
} from '@k98kurz/functional-result';
import type { Result } from '@k98kurz/functional-result';

type Input = { value: number };
type ApiError = { code: string; message: string };

const checkRange = (n: number): Result<number, ApiError> =>
  n > 100
    ? failure({ code: 'range', message: `${n} is out of range` })
    : success(n);

const processInput = flowSync(
  map((i: Input) => i.value),
  chain(checkRange)
);

const resultA = processInput(success({ value: 42 } as Input));
const resultB = processInput(success({ value: 200 } as Input));
```
