// Re-export generic error infrastructure from src/error/
export { error_logger, ErrorLogger } from '../../error/error_logger';
export { with_retry, ErrorRecovery, type RetryOptions } from '../../error/retry';
export { error_notification_manager, ErrorNotificationManager, type ErrorNotification } from '../../error/error_notification_manager';

import { error_notification_manager } from '../../error/error_notification_manager';

function noop(): void {
  // intentionally empty — placeholder action for dismiss-style notifications
}

// Chart-specific error types
export class LayoutError extends Error {
  constructor(message: string, public readonly node_count?: number, public readonly edge_count?: number) {
    super(message);
    this.name = 'LayoutError';
  }
}

// Helper function to handle common React Flow errors
export function handle_react_flow_error(error: Error): void {
  if (error.message.includes('Cannot read properties of undefined')) {
    error_notification_manager.notify(
      'Data loading error. Some nodes may not be displayed correctly.',
      'warning',
      [{ label: 'Reload', action: () => window.location.reload() }]
    );
  } else if (error.message.includes('Maximum update depth exceeded')) {
    error_notification_manager.notify(
      'Performance issue detected. Try reducing the number of nodes.',
      'error'
    );
  } else if (error.message.includes('ELK') || error.message.includes('layout')) {
    error_notification_manager.notify(
      'Layout calculation failed. Using fallback layout.',
      'warning'
    );
  } else {
    error_notification_manager.notify(
      `Unexpected error: ${error.message}`,
      'error',
      [{ label: 'Dismiss', action: noop }]
    );
  }
}
