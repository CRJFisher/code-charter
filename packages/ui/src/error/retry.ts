import { error_logger } from './error_logger';

export interface RetryOptions {
  max_attempts?: number;
  delay_ms?: number;
  backoff_multiplier?: number;
  timeout?: number;
  on_retry?: (attempt: number, error: Error) => void;
}

// Retry wrapper for async operations
export async function with_retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    max_attempts = 3,
    delay_ms = 1000,
    backoff_multiplier = 2,
    timeout = 30000,
    on_retry,
  } = options;

  let last_error: Error | null = null;

  for (let attempt = 1; attempt <= max_attempts; attempt++) {
    try {
      // Create a timeout promise
      const timeout_promise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
      });

      // Race between operation and timeout
      const result = await Promise.race([operation(), timeout_promise]);

      // Success - return result
      return result;
    } catch (error) {
      last_error = error instanceof Error ? error : new Error(String(error));

      // Log the error
      error_logger.log(last_error, attempt === max_attempts ? 'error' : 'warning', {
        attempt,
        max_attempts,
        operation: operation.name || 'anonymous',
      });

      // Don't retry on last attempt
      if (attempt === max_attempts) {
        break;
      }

      // Call retry callback if provided
      if (on_retry) {
        on_retry(attempt, last_error);
      }

      // Calculate delay with exponential backoff
      const delay = delay_ms * Math.pow(backoff_multiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  throw last_error || new Error('Operation failed after all retry attempts');
}

// Error recovery strategies
export class ErrorRecovery {
  static async try_with_fallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    on_fallback?: (error: Error) => void
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      error_logger.log(err, 'warning', { strategy: 'fallback' });

      if (on_fallback) {
        on_fallback(err);
      }

      return await fallback();
    }
  }

  static graceful_degrade<T, U>(
    operation: () => T,
    default_value: U,
    on_error?: (error: Error) => void
  ): T | U {
    try {
      return operation();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      error_logger.log(err, 'info', { strategy: 'graceful-degrade' });

      if (on_error) {
        on_error(err);
      }

      return default_value;
    }
  }
}
