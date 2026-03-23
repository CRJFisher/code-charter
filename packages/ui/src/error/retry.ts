import { errorLogger } from './error_logger';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  timeout?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

// Retry wrapper for async operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    timeout = 30000,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
      });

      // Race between operation and timeout
      const result = await Promise.race([operation(), timeoutPromise]);

      // Success - return result
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log the error
      errorLogger.log(lastError, attempt === maxAttempts ? 'error' : 'warning', {
        attempt,
        maxAttempts,
        operation: operation.name || 'anonymous',
      });

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Calculate delay with exponential backoff
      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  throw lastError || new Error('Operation failed after all retry attempts');
}

// Error recovery strategies
export class ErrorRecovery {
  static async tryWithFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    onFallback?: (error: Error) => void
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorLogger.log(err, 'warning', { strategy: 'fallback' });

      if (onFallback) {
        onFallback(err);
      }

      return await fallback();
    }
  }

  static gracefulDegrade<T, U>(
    operation: () => T,
    defaultValue: U,
    onError?: (error: Error) => void
  ): T | U {
    try {
      return operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorLogger.log(err, 'info', { strategy: 'graceful-degrade' });

      if (onError) {
        onError(err);
      }

      return defaultValue;
    }
  }
}
