// Re-export generic error infrastructure from src/error/
export { errorLogger, ErrorLogger } from '../../error/error_logger';
export { withRetry, ErrorRecovery, type RetryOptions } from '../../error/retry';
export { errorNotificationManager, ErrorNotificationManager, type ErrorNotification } from '../../error/error_notification_manager';

import { errorNotificationManager } from '../../error/error_notification_manager';

// Chart-specific error types
export class LayoutError extends Error {
  constructor(message: string, public readonly nodeCount?: number, public readonly edgeCount?: number) {
    super(message);
    this.name = 'LayoutError';
  }
}

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
