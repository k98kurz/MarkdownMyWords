// Functional Result type with discriminated union
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

// Helper constructors
const success = <T, E = Error>(data: T): Result<T, E> => ({ success: true, data })
const failure = <T = never, E = Error>(error: E): Result<T, E> => ({ success: false, error })

// Functional helpers for composition
const map = <T, U, E>(result: Result<T, E>, fn: (data: T) => U): Result<U, E> =>
  result.success ? success<U, E>(fn(result.data)) : (result as Result<U, E>)

const flatMap = <T, U, E>(result: Result<T, E>, fn: (data: T) => Result<U, E>): Result<U, E> =>
  result.success ? fn(result.data) : (result as Result<U, E>)

const match = <T, E, R>(
  result: Result<T, E>,
  onSuccess: (data: T) => R,
  onFailure: (error: E) => R
): R => (result.success ? onSuccess(result.data) : onFailure(result.error))

// Type guards
const isSuccess = <T, E>(result: Result<T, E>): result is { success: true; data: T } =>
  result.success

const isFailure = <T, E>(result: Result<T, E>): result is { success: false; error: E } =>
  !result.success

// tryCatch helpers
const tryCatch = async <T, E = Error>(
  fn: () => Promise<T>,
  errorTransformer?: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    const data = await fn()
    return success<T, E>(data)
  } catch (error) {
    const transformedError = errorTransformer
      ? errorTransformer(error)
      : ((error instanceof Error ? error : new Error(String(error))) as E)
    return failure<T, E>(transformedError)
  }
}

const tryCatchSync = <T, E = Error>(
  fn: () => T,
  errorTransformer?: (error: unknown) => E
): Result<T, E> => {
  try {
    const data = fn()
    return success<T, E>(data)
  } catch (error) {
    const transformedError = errorTransformer
      ? errorTransformer(error)
      : ((error instanceof Error ? error : new Error(String(error))) as E)
    return failure<T, E>(transformedError)
  }
}

// Utility helpers
const getOrElse = <T, E>(result: Result<T, E>, defaultValue: T): T =>
  result.success ? result.data : defaultValue

const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (result.success) return result.data
  throw result.error
}

// Function composition for Result types
const pipeResult = <T, E>(result: Result<T, E>) => ({
  map: <U>(fn: (data: T) => U) => pipeResult(map(result, fn)),
  flatMap: <U>(fn: (data: T) => Result<U, E>) => pipeResult(flatMap(result, fn)),
  match: <R>(onSuccess: (data: T) => R, onFailure: (error: E) => R) =>
    match(result, onSuccess, onFailure),
  get: () => result,
  getOrElse: (defaultValue: T) => getOrElse(result, defaultValue),
  getOrThrow: () => getOrThrow(result),
})

// General function composition
const pipe = <T>(value: T) => ({
  to: <U>(fn: (value: T) => U) => pipe(fn(value)),
  get: () => value,
})

// Export everything
export type { Result }
export {
  success,
  failure,
  map,
  flatMap,
  match,
  isSuccess,
  isFailure,
  tryCatch,
  tryCatchSync,
  getOrElse,
  getOrThrow,
  pipe,
  pipeResult,
}
