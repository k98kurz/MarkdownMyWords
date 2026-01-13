export interface RetryOptions {
  maxAttempts: number
  baseDelay: number
  backoffMultiplier: number
  retryableErrors?: string[]
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = { maxAttempts: 4, baseDelay: 100, backoffMultiplier: 2 }
): Promise<T | never> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (attempt < options.maxAttempts) {
        if (options.retryableErrors && options.retryableErrors.length > 0) {
          const shouldRetryError = options.retryableErrors.some(retryableErr =>
            errorMessage.includes(retryableErr)
          )
          if (!shouldRetryError) {
            throw error
          }
        }
        const delay = options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1)
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw error
    }
  }

  // This should never be reached - operation either returns successfully in the try block
  // or throws an error after exhausting retries
  throw new Error('retryWithBackoff: Unexpected state - function should have returned or thrown')
}
