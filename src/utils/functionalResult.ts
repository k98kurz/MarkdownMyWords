/**
 * Functional Result Utility
 *
 * A type-safe functional programming utility for error handling and composition.
 * Provides Result type with discriminated unions for handling success/failure cases
 * without throwing exceptions.
 *
 * Features:
 * - Type-safe error handling with unknown default error type
 * - Curried functions for point-free style programming
 * - Functional programming operations: map, chain, fold, sequence, traverse, validate
 * - Unified async pipe for composing operations
 * - Zero unsafe type assertions
 */

// Core type definition with unknown default error type for better type safety
type Result<T, E = unknown> =
  | { success: true; data: T }
  | { success: false; error: E };

// ValidationError interface for the validate operation
interface ValidationError {
  field: string;
  message: string;
}

/**
 * Creates a successful Result containing the provided data
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to unknown)
 * @param data - The successful value to wrap
 * @returns A Result representing success
 */
const success = <T, E = unknown>(data: T): Result<T, E> => ({
  success: true,
  data,
});

/**
 * Creates a failed Result containing the provided error
 * @template T - The type of the success value (defaults to never)
 * @template E - The type of the error value
 * @param error - The error value to wrap
 * @returns A Result representing failure
 */
const failure = <T = never, E = unknown>(error: E): Result<T, E> => ({
  success: false,
  error,
});

/**
 * Transforms the success value of a Result using the provided function
 * Curried function: first takes the transformation function, then the Result
 * @template T - Input success type
 * @template U - Output success type
 * @template E - Error type (preserved)
 * @param fn - Function to transform the success value
 * @returns Function that takes a Result and returns the transformed Result
 */
const map =
  <T, U, E>(fn: (data: T) => U) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? success(fn(result.data)) : result;

/**
 * Chains operations that may fail, flattening nested Results
 * Curried function: first takes the chaining function, then the Result
 * @template T - Input success type
 * @template U - Output success type
 * @template E - Error type (preserved)
 * @param fn - Function that returns a Result
 * @returns Function that takes a Result and returns the chained Result
 */
const chain =
  <T, U, E>(fn: (data: T) => Result<U, E>) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? fn(result.data) : result;

/**
 * Pattern matching for Results - executes one of two functions based on Result type
 * Curried function: first takes success/failure handlers, then the Result
 * @template T - Success type
 * @template E - Error type
 * @template R - Return type
 * @param onSuccess - Function to execute on success
 * @param onFailure - Function to execute on failure
 * @returns Function that takes a Result and returns the result of pattern matching
 */
const match =
  <T, E, R>(onSuccess: (data: T) => R, onFailure: (error: E) => R) =>
  (result: Result<T, E>): R =>
    result.success ? onSuccess(result.data) : onFailure(result.error);

/**
 * Folds a Result into a single value using the provided functions
 * Curried function: first takes success/failure handlers, then the Result
 * Alias for match with more semantic meaning for final value extraction
 * @template T - Success type
 * @template E - Error type
 * @template R - Return type
 * @param onSuccess - Function to execute on success
 * @param onFailure - Function to execute on failure
 * @returns Function that takes a Result and returns the folded value
 */
const fold =
  <T, E, R>(onSuccess: (data: T) => R, onFailure: (error: E) => R) =>
  (result: Result<T, E>): R =>
    match(onSuccess, onFailure)(result);

/**
 * Executes a sequence of Results, collecting all success values or returning first failure
 * @template T - Success type of individual Results
 * @template E - Error type
 * @param results - Array of Results to sequence
 * @returns Result containing array of success values or first failure encountered
 */
const sequence = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const acc: T[] = [];
  for (const result of results) {
    if (!result.success) return result;
    acc.push(result.data);
  }
  return success(acc);
};

/**
 * Maps over an array using a function that returns Results, then sequences the results
 * Curried function: first takes the mapping function, then the array
 * @template T - Input array element type
 * @template U - Output Result success type
 * @template E - Error type
 * @param fn - Function that maps array elements to Results
 * @returns Function that takes an array and returns a sequenced Result
 */
const traverse =
  <T, U, E>(fn: (item: T) => Result<U, E>) =>
  (items: T[]): Result<U[], E> =>
    sequence(items.map(fn));

/**
 * Validates a value against an array of validator functions
 * Curried function: first takes validators, then the value to validate
 * @template T - Type of value to validate
 * @param validators - Array of validator functions that return ValidationError or null
 * @returns Function that takes a value and returns validation Result
 */
const validate =
  <T>(validators: ((t: T) => ValidationError | null)[]) =>
  (value: T): Result<T, ValidationError[]> => {
    const errors = validators
      .map(v => v(value))
      .filter((v): v is ValidationError => v !== null);
    return errors.length > 0 ? failure(errors) : success(value);
  };

/**
 * Type guard to check if a Result is successful and narrow its type
 * @template T - Success type
 * @template E - Error type
 * @param result - Result to check
 * @returns True if Result is successful
 */
const isSuccess = <T, E>(
  result: Result<T, E>
): result is { success: true; data: T } => result.success;

/**
 * Type guard to check if a Result is a failure and narrow its type
 * @template T - Success type
 * @template E - Error type
 * @param result - Result to check
 * @returns True if Result is a failure
 */
const isFailure = <T, E>(
  result: Result<T, E>
): result is { success: false; error: E } => !result.success;

/**
 * Wraps a function in a try-catch block, returning a Result
 * Handles both synchronous and asynchronous functions with a unified interface
 *
 * @example
 * ```typescript
 * // Sync function
 * const syncResult = await tryCatch(() => 42)
 *
 * // Async function
 * const asyncResult = await tryCatch(async () => 42)
 *
 * // With error transformation
 * const result = await tryCatch(
 *   () => riskyOperation(),
 *   error => `Custom: ${error}`
 * )
 * ```
 *
 * @template T - Return type of the function
 * @template E - Error type (defaults to unknown)
 * @param fn - Function to wrap (sync or async)
 * @param errorTransformer - Optional function to transform caught errors
 * @returns Promise resolving to a Result
 */
const tryCatch = async <T, E = unknown>(
  fn: (() => T) | (() => Promise<T>),
  errorTransformer?: (error: unknown) => E
): Promise<Result<T, E>> => {
  try {
    const data = await Promise.resolve(fn());
    return success<T, E>(data);
  } catch (error) {
    const transformedError = errorTransformer
      ? errorTransformer(error)
      : (error as E);
    return failure<T, E>(transformedError);
  }
};

/**
 * Extracts the success value or returns a default value
 * Curried function: first takes default value, then the Result
 * @template T - Success type
 * @template E - Error type
 * @param defaultValue - Default value to return on failure
 * @returns Function that takes a Result and returns the value or default
 */
const getOrElse =
  <T, E>(defaultValue: T) =>
  (result: Result<T, E>): T =>
    result.success ? result.data : defaultValue;

/**
 * Extracts the success value or throws the error
 * Curried function that returns a function to extract the value
 * @template T - Success type
 * @template E - Error type
 * @returns Function that takes a Result and returns the success value or throws
 */
const getOrThrow =
  <T, E>() =>
  (result: Result<T, E>): T => {
    if (result.success) return result.data;
    throw result.error;
  };

/**
 * Unified pipe function for composing Result operations
 * Handles both synchronous and asynchronous operations through Promise resolution
 * Uses `any` in implementation to enable type transformation while maintaining compile-time type safety
 * @template T - Initial success type
 * @template E - Error type (preserved throughout chain)
 * @param initial - Initial Result or Promise<Result>
 * @param operations - Array of operations that transform Results
 * @returns Promise resolving to the final Result
 */
const pipe = async <T, E>(
  initial: Result<T, E> | Promise<Result<T, E>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...operations: Array<
    (result: Result<any, E>) => Result<any, E> | Promise<Result<any, E>>
  >
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
Promise<Result<any, E>> => {
  let current = await Promise.resolve(initial);
  for (const operation of operations) {
    current = await Promise.resolve(operation(current));
  }
  return current;
};

// Export everything
export type { Result, ValidationError };
export {
  success,
  failure,
  map,
  chain,
  match,
  fold,
  sequence,
  traverse,
  validate,
  isSuccess,
  isFailure,
  tryCatch,
  getOrElse,
  getOrThrow,
  pipe,
};
