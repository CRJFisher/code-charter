import { PerformanceMonitor } from './performance_utils';
import { CONFIG } from './config';

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  timeout?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export class ErrorLogger {
  private errors: Array<{
    timestamp: number;
    error: Error;
    context?: any;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }> = [];

  log(error: Error, severity: 'info' | 'warning' | 'error' | 'critical' = 'error', context?: any) {
    const errorEntry = {
      timestamp: Date.now(),
      error,
      context,
      severity,
    };
    
    this.errors.push(errorEntry);
    
    // Log to console with appropriate level
    const consoleMethod = severity === 'info' ? 'log' : severity === 'warning' ? 'warn' : 'error';
    console[consoleMethod](`[${severity.toUpperCase()}]`, error.message, context || '');
    
    // Keep only last N errors to prevent memory leak
    if (this.errors.length > CONFIG.error.errorLog.maxErrors) {
      this.errors = this.errors.slice(-CONFIG.error.errorLog.maxErrors);
    }
  }

  getErrors() {
    return [...this.errors];
  }

  clear() {
    this.errors = [];
  }

  getErrorSummary() {
    const summary = {
      total: this.errors.length,
      byType: new Map<string, number>(),
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
    };

    this.errors.forEach(entry => {
      const errorType = entry.error.name || 'Unknown';
      summary.byType.set(errorType, (summary.byType.get(errorType) || 0) + 1);
      summary.bySeverity[entry.severity]++;
    });

    return summary;
  }
}

// Global error logger instance
export const errorLogger = new ErrorLogger();

// Retry wrapper for async operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = CONFIG.error.retry.maxRetries,
    delayMs = 1000,
    backoffMultiplier = 2,
    timeout = CONFIG.error.retry.timeout,
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

// Specific error types for React Flow
export class LayoutError extends Error {
  constructor(message: string, public readonly nodeCount?: number, public readonly edgeCount?: number) {
    super(message);
    this.name = 'LayoutError';
  }
}

export class DataProcessingError extends Error {
  constructor(message: string, public readonly data?: any) {
    super(message);
    this.name = 'DataProcessingError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Error notification system
export interface ErrorNotification {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: number;
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
}

export class ErrorNotificationManager {
  private notifications: ErrorNotification[] = [];
  private listeners: ((notifications: ErrorNotification[]) => void)[] = [];

  notify(
    message: string,
    severity: 'info' | 'warning' | 'error' = 'error',
    actions?: ErrorNotification['actions']
  ): string {
    const notification: ErrorNotification = {
      id: `error-${Date.now()}-${Math.random()}`,
      message,
      severity,
      timestamp: Date.now(),
      actions,
    };
    
    this.notifications.push(notification);
    this.notifyListeners();
    
    // Auto-dismiss info notifications after configured delay
    if (severity === 'info') {
      setTimeout(() => this.dismiss(notification.id), CONFIG.error.notifications.autoDismissDelay);
    }
    
    return notification.id;
  }

  dismiss(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  dismissAll() {
    this.notifications = [];
    this.notifyListeners();
  }

  subscribe(listener: (notifications: ErrorNotification[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }

  getNotifications() {
    return [...this.notifications];
  }
}

// Global notification manager instance
export const errorNotificationManager = new ErrorNotificationManager();

// Helper function to handle common React Flow errors
export function handleReactFlowError(error: Error): void {
  if (error.message.includes('Cannot read properties of undefined')) {
    errorNotificationManager.notify(
      'Data loading error. Some nodes may not be displayed correctly.',
      'warning',
      [{ label: 'Reload', action: () => window.location.reload() }]
    );
  } else if (error.message.includes('Maximum update depth exceeded')) {
    errorNotificationManager.notify(
      'Performance issue detected. Try reducing the number of nodes.',
      'error'
    );
  } else if (error.message.includes('ELK') || error.message.includes('layout')) {
    errorNotificationManager.notify(
      'Layout calculation failed. Using fallback layout.',
      'warning'
    );
  } else {
    errorNotificationManager.notify(
      `Unexpected error: ${error.message}`,
      'error',
      [{ label: 'Dismiss', action: () => {} }]
    );
  }
}