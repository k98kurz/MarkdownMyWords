/**
 * Functional Result Utility Tests
 */

import { TestRunner, printTestSummary, type TestSuiteResult } from '../utils/testRunner'
import {
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
  type Result,
} from '../utils/functionalResult'

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

async function testConstructors(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Constructors...\n')

  const runner = new TestRunner('Functional Result - Constructors')

  await runner.run('should create success result with correct type', async () => {
    const result = success<number, unknown>(42)
    assert(result.success === true, 'Success result should have success: true')
    assert(isSuccess(result) && result.data === 42, 'Success result should contain correct data')
  })

  await runner.run('should create failure result with correct type', async () => {
    const result = failure<never, string>('error')
    assert(result.success === false, 'Failure result should have success: false')
    assert(
      isFailure(result) && result.error === 'error',
      'Failure result should contain correct error'
    )
  })

  await runner.run('should handle generic type inference correctly', async () => {
    const successResult = success<string, never>('hello')
    const failureResult = failure<never, number>(404)
    assert(
      successResult.success && typeof successResult.data === 'string',
      'Type inference should work for success'
    )
    assert(
      !failureResult.success && typeof failureResult.error === 'number',
      'Type inference should work for failure'
    )
  })

  runner.printResults()
  return runner.getResults()
}

async function testTransformations(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Transformations...\n')

  const runner = new TestRunner('Functional Result - Transformations')

  await runner.run('should map success values and preserve failures', async () => {
    const successResult = success<number, string>(5)
    const failureResult = failure<number, string>('error')

    const doubled = map((x: number) => x * 2)(successResult)
    const preservedFailure = map((x: number) => x * 2)(failureResult)

    assert(doubled.success && doubled.data === 10, 'Map should transform success values')
    assert(
      !preservedFailure.success && preservedFailure.error === 'error',
      'Map should preserve failures'
    )
  })

  await runner.run('should chain operations correctly', async () => {
    const successResult = success<number, string>(5)
    const failureResult = failure<number, string>('error')

    const chained = chain((x: number) => success(x * 3))(successResult)
    const chainedFailure = chain((x: number) => success(x * 3))(failureResult)

    assert(chained.success && chained.data === 15, 'Chain should transform success values')
    assert(
      !chainedFailure.success && chainedFailure.error === 'error',
      'Chain should preserve failures'
    )
  })

  await runner.run('should match execute correct branch based on result type', async () => {
    const successResult = success<number, string>(42)
    const failureResult = failure<number, string>('error')

    const successMatch = match(
      (x: number) => `success: ${x}`,
      (e: string) => `error: ${e}`
    )(successResult)
    const failureMatch = match(
      (x: number) => `success: ${x}`,
      (e: string) => `error: ${e}`
    )(failureResult)

    assert(
      successMatch === 'success: 42',
      'Match should execute success branch for success results'
    )
    assert(
      failureMatch === 'error: error',
      'Match should execute failure branch for failure results'
    )
  })

  await runner.run('should fold return consistent type regardless of branch', async () => {
    const successResult = success<number, string>(42)
    const failureResult = failure<number, string>('error')

    const successFold = fold(
      (x: number) => x.toString(),
      (e: string) => `error: ${e}`
    )(successResult)
    const failureFold = fold(
      (x: number) => x.toString(),
      (e: string) => `error: ${e}`
    )(failureResult)

    assert(successFold === '42', 'Fold should return result from success branch')
    assert(failureFold === 'error: error', 'Fold should return result from failure branch')
  })

  await runner.run('should match execute correct branch based on result type', async () => {
    const successResult = success<number, string>(42)
    const failureResult = failure<number, string>('error')

    const successMatch = match(
      (x: number) => `success: ${x}`,
      (e: string) => `error: ${e}`
    )(successResult)
    const failureMatch = match(
      (x: number) => `success: ${x}`,
      (e: string) => `error: ${e}`
    )(failureResult)

    assert(
      successMatch === 'success: 42',
      'Match should execute success branch for success results'
    )
    assert(
      failureMatch === 'error: error',
      'Match should execute failure branch for failure results'
    )
  })

  await runner.run('should fold return consistent type regardless of branch', async () => {
    const successResult = success<number, number>(42)
    const failureResult = failure<number, number>(404)

    const successFold = fold(
      (x: number) => x.toString(),
      (e: number) => `error: ${e}`
    )(successResult)
    const failureFold = fold(
      (x: number) => x.toString(),
      (e: number) => `error: ${e}`
    )(failureResult)

    assert(successFold === '42', 'Fold should return result from success branch')
    assert(failureFold === 'error: 404', 'Fold should return result from failure branch')
  })

  runner.printResults()
  return runner.getResults()
}

async function testErrorHandling(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Error Handling...\n')

  const runner = new TestRunner('Functional Result - Error Handling')

  await runner.run('should tryCatch handle successful async operations', async () => {
    const result = await tryCatch<string, unknown>(async () => 'success')
    assert(
      result.success && result.data === 'success',
      'tryCatch should handle successful async operations'
    )
  })

  await runner.run('should tryCatch handle async errors with transformation', async () => {
    const originalError = new Error('test error')
    const result = await tryCatch<string, string>(
      async () => {
        throw originalError
      },
      error => `transformed: ${error instanceof Error ? error.message : String(error)}`
    )
    assert(
      !result.success && result.error === 'transformed: test error',
      'tryCatch should transform errors'
    )
  })

  await runner.run('should tryCatch handle sync operations', async () => {
    const result = await tryCatch<string, unknown>(() => 'sync result')
    assert(
      result.success && result.data === 'sync result',
      'tryCatch should handle sync operations'
    )
  })

  await runner.run('should tryCatch handle async operations', async () => {
    const result = await tryCatch<string, unknown>(async () => 'async result')
    assert(
      result.success && result.data === 'async result',
      'tryCatch should handle async operations'
    )
  })

  await runner.run('should tryCatch handle sync functions', async () => {
    const result = await tryCatch<string, unknown>(() => 'sync result')
    assert(result.success && result.data === 'sync result', 'tryCatch should handle sync functions')
  })

  await runner.run('should preserve original error types without assertions', async () => {
    const customError = { code: 'CUSTOM', message: 'custom error' }
    const result = await tryCatch<never, typeof customError>(async () => {
      throw customError
    })
    assert(
      !result.success && result.error === customError,
      'tryCatch should preserve original error types'
    )
  })

  await runner.run('should tryCatch handle sync functions with type parameters', async () => {
    const result = await tryCatch(() => 'sync result')
    assert(
      result.success && result.data === 'sync result',
      'tryCatch should handle sync functions with type parameters'
    )
  })

  await runner.run(
    'should tryCatch handle both sync and async functions with same interface',
    async () => {
      const syncFn = (): string => 'sync'
      const asyncFn = async (): Promise<string> => 'async'

      const syncResult = await tryCatch<string, unknown>(syncFn)
      const asyncResult = await tryCatch<string, unknown>(asyncFn)

      assert(
        syncResult.success && syncResult.data === 'sync',
        'tryCatch should handle sync functions'
      )
      assert(
        asyncResult.success && asyncResult.data === 'async',
        'tryCatch should handle async functions'
      )
    }
  )

  await runner.run('should preserve original error types without assertions', async () => {
    const customError = { code: 'CUSTOM', message: 'custom error' }
    const result = await tryCatch(async () => {
      throw customError
    })
    assert(
      !result.success && result.error === customError,
      'tryCatch should preserve original error types'
    )
  })

  await runner.run('should handle unknown error types safely', async () => {
    const result = await tryCatch(async () => {
      throw 'string error'
    })
    assert(
      !result.success && result.error === 'string error',
      'tryCatch should handle unknown error types safely'
    )
  })

  runner.printResults()
  return runner.getResults()
}

async function testComposition(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Composition...\n')

  const runner = new TestRunner('Functional Result - Composition')

  await runner.run('should pipe work with curried operations', async () => {
    const result = await pipe(
      success<number, string>(5),
      map((x: number) => x * 2),
      chain((x: number) => success<string, string>(x.toString()))
    )
    assert(result.success && result.data === '10', 'Pipe should work with curried operations')
  })

  await runner.run('should pipe maintain type safety throughout chain', async () => {
    const result = await pipe(
      success<number, string>(5),
      map((x: number) => x * 2),
      chain((x: number) => success<string, string>(x.toString())),
      map((s: string) => `${s}_processed`)
    )
    assert(result.success && result.data === '10_processed', 'Pipe should maintain type safety')
  })

  await runner.run('should pipe handle point-free style', async () => {
    const double = map((x: number) => x * 2)
    const toString = map((x: number) => x.toString())

    const result = await pipe(success<number, string>(5), double, toString)
    assert(result.success && result.data === '10', 'Pipe should handle point-free style')
  })

  await runner.run('should curried functions work independently', async () => {
    const double = map((x: number) => x * 2)
    const toString = map((x: number) => x.toString())

    const doubled = double(success<number, string>(5))
    const stringified = toString(doubled)

    assert(
      stringified.success && stringified.data === '10',
      'Curried functions should work independently'
    )
  })

  await runner.run('should pipe maintain type safety throughout chain', async () => {
    const result = await pipe(
      success(5),
      map(x => x * 2),
      chain(x => success(x.toString())),
      map(s => `${s}_processed`)
    )
    assert(result.success && result.data === '10_processed', 'Pipe should maintain type safety')
  })

  await runner.run('should pipe handle point-free style', async () => {
    const double = map((x: number) => x * 2)
    const toString = map((x: number) => x.toString())

    const result = await pipe(success(5), double, toString)
    assert(result.success && result.data === '10', 'Pipe should handle point-free style')
  })

  await runner.run('should curried functions work independently', async () => {
    const double = map((x: number) => x * 2)
    const toString = map((x: number) => x.toString())

    const doubled = double(success<number, string>(5))
    const stringified = toString(doubled)

    assert(
      stringified.success && stringified.data === '10',
      'Curried functions should work independently'
    )
  })

  await runner.run('should pipe handle empty operations array', async () => {
    const initial = success<number, string>(42)
    const result = await pipe(initial)
    assert(result === initial, 'Pipe should return initial result for empty operations')
  })

  await runner.run('should pipe handle mixed sync and async operations', async () => {
    const result = await pipe(
      success<number, string>(5),
      map((x: number) => x * 2),
      chain((x: number) => success<string, string>(x.toString())),
      map((s: string) => `${s}_async`)
    )
    assert(
      result.success && result.data === '10_async',
      'Pipe should handle mixed sync and async operations'
    )
  })

  await runner.run('should handle failure propagation in pipe', async () => {
    const result = await pipe(
      success<number, string>(5),
      chain((_x: number) => failure<number, string>('error in chain')),
      map((x: number) => x * 2) // This should not execute
    )
    assert(!result.success && result.error === 'error in chain', 'Pipe should propagate failures')
  })

  await runner.run('should pipe handle mixed sync and async operations', async () => {
    const result = await pipe(
      success<number, string>(5),
      map((x: number) => x * 2),
      chain((x: number) => success<string, string>(x.toString())),
      map((s: string) => `${s}_async`)
    )
    assert(
      result.success && result.data === '10_async',
      'Pipe should handle mixed sync and async operations'
    )
  })

  runner.printResults()
  return runner.getResults()
}

async function testNewFeatures(): Promise<TestSuiteResult> {
  console.log('🧪 Testing New Functional Result Features...\n')

  const runner = new TestRunner('Functional Result - New Features')

  await runner.run('should sequence handle all success case', async () => {
    const results = [
      success<number, string>(1),
      success<number, string>(2),
      success<number, string>(3),
    ]
    const sequenced = sequence(results)
    assert(
      sequenced.success && JSON.stringify(sequenced.data) === JSON.stringify([1, 2, 3]),
      'Sequence should collect all successes'
    )
  })

  await runner.run('should sequence return first failure encountered', async () => {
    const results = [
      success<number, string>(1),
      failure<number, string>('first error'),
      failure<number, string>('second error'),
    ]
    const sequenced = sequence(results)
    assert(
      !sequenced.success && sequenced.error === 'first error',
      'Sequence should return first failure'
    )
  })

  await runner.run('should sequence return first failure encountered', async () => {
    const results = [success(1), failure('first error'), failure('second error')]
    const sequenced = sequence(results)
    assert(
      !sequenced.success && sequenced.error === 'first error',
      'Sequence should return first failure'
    )
  })

  await runner.run('should traverse map arrays with Result functions', async () => {
    const items = [1, 2, 3]
    const result = traverse((x: number) => success<number, string>(x * 2))(items)
    assert(
      result.success && JSON.stringify(result.data) === JSON.stringify([2, 4, 6]),
      'Traverse should map arrays with Result functions'
    )
  })

  await runner.run('should validate collect all validation errors', async () => {
    const validators = [
      (value: string) => (value.length >= 3 ? null : { field: 'length', message: 'Too short' }),
      (value: string) =>
        value.includes('@') ? null : { field: 'format', message: 'Invalid email' },
    ]
    const result = validate(validators)('ab')
    assert(
      !result.success && result.error.length === 2,
      'Validate should collect all validation errors'
    )
  })

  await runner.run('should validate return success when no errors', async () => {
    const validators = [
      (value: string) => (value.length >= 3 ? null : { field: 'length', message: 'Too short' }),
      (value: string) =>
        value.includes('@') ? null : { field: 'format', message: 'Invalid email' },
    ]
    const result = validate(validators)('test@example.com')
    assert(
      result.success && result.data === 'test@example.com',
      'Validate should return success when no errors'
    )
  })

  await runner.run('should getOrElse return default value on failure', async () => {
    const successResult = success<number, string>(42)
    const failureResult = failure<number, string>('error')

    const successValue = getOrElse(0)(successResult)
    const failureValue = getOrElse(0)(failureResult)

    assert(successValue === 42, 'getOrElse should return success value for success results')
    assert(failureValue === 0, 'getOrElse should return default value for failure results')
  })

  await runner.run('should getOrThrow throw error on failure', async () => {
    const successResult = success<number, string>(42)
    const failureResult = failure<number, string>('error')

    const successValue = getOrThrow<number, string>()(successResult)
    assert(successValue === 42, 'getOrThrow should return success value for success results')

    try {
      getOrThrow<number, string>()(failureResult)
      throw new Error('Should have thrown error')
    } catch (error) {
      assert(error === 'error', 'getOrThrow should throw error for failure results')
    }
  })

  runner.printResults()
  return runner.getResults()
}

async function testTypeSafety(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Type Safety...\n')

  const runner = new TestRunner('Functional Result - Type Safety')

  await runner.run('should isSuccess type guard narrow correctly', async () => {
    const result: Result<string, number> = success('test')
    if (isSuccess(result)) {
      assert(typeof result.data === 'string', 'isSuccess should narrow to success type')
    } else {
      throw new Error('Should have been narrowed to success type')
    }
  })

  await runner.run('should isFailure type guard narrow correctly', async () => {
    const result: Result<string, number> = failure(404)
    if (isFailure(result)) {
      assert(typeof result.error === 'number', 'isFailure should narrow to error type')
    } else {
      throw new Error('Should have been narrowed to failure type')
    }
  })

  await runner.run('should handle complex generic types', async () => {
    type User = { id: number; name: string; email?: string }
    type ApiError = { code: string; message: string }

    const userResult: Result<User, ApiError> = success({ id: 1, name: 'test' })
    const transformed = map((user: User) => ({ ...user, email: `${user.name}@example.com` }))(
      userResult
    )

    assert(
      transformed.success &&
        transformed.data.id === 1 &&
        transformed.data.name === 'test' &&
        transformed.data.email === 'test@example.com',
      'Should handle complex generic types correctly'
    )
  })

  runner.printResults()
  return runner.getResults()
}

async function testEdgeCases(): Promise<TestSuiteResult> {
  console.log('🧪 Testing Functional Result Edge Cases...\n')

  const runner = new TestRunner('Functional Result - Edge Cases')

  await runner.run('should handle nested Result types', async () => {
    const inner = success<string, number>('nested')
    const nested: Result<Result<string, number>, number> = success(inner)
    const flattened = chain((x: Result<string, number>) => x)(nested)
    assert(flattened.success && flattened.data === 'nested', 'Should handle nested Result types')
  })

  await runner.run('should handle empty arrays in sequence', async () => {
    const result = sequence([])
    assert(result.success && result.data.length === 0, 'Sequence should handle empty arrays')
  })

  await runner.run('should handle empty arrays in traverse', async () => {
    const result = traverse((x: number) => success<number, string>(x * 2))([])
    assert(result.success && result.data.length === 0, 'Traverse should handle empty arrays')
  })

  await runner.run('should handle undefined values in validators', async () => {
    const validators = [
      (value: unknown) =>
        value !== undefined ? null : { field: 'value', message: 'Cannot be undefined' },
    ]
    const result = validate(validators)(undefined)
    assert(
      !result.success && result.error[0].message === 'Cannot be undefined',
      'Should handle undefined in validators'
    )
  })

  runner.printResults()
  return runner.getResults()
}

export async function testFunctionalResult(): Promise<void> {
  console.log('🚀 Starting Functional Result Utility Tests\n')
  console.log('='.repeat(60))

  const suiteResults: TestSuiteResult[] = []

  const constructorResult = await testConstructors()
  suiteResults.push(constructorResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const transformationResult = await testTransformations()
  suiteResults.push(transformationResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const errorHandlingResult = await testErrorHandling()
  suiteResults.push(errorHandlingResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const compositionResult = await testComposition()
  suiteResults.push(compositionResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const newFeaturesResult = await testNewFeatures()
  suiteResults.push(newFeaturesResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const typeSafetyResult = await testTypeSafety()
  suiteResults.push(typeSafetyResult)
  console.log('\n' + '='.repeat(60) + '\n')

  const edgeCasesResult = await testEdgeCases()
  suiteResults.push(edgeCasesResult)
  console.log('\n' + '='.repeat(60) + '\n')

  printTestSummary(suiteResults)
}
