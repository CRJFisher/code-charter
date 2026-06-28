export { error_logger } from '../../error/error_logger';
export { with_retry, ErrorRecovery } from '../../error/retry';
export { error_notification_manager } from '../../error/error_notification_manager';

import { error_notification_manager } from '../../error/error_notification_manager';

// The dismiss button only needs the notification framework to close itself, so its action is a no-op.
function noop(): void {}

export class LayoutError extends Error {
  constructor(message: string, public readonly node_count?: number, public readonly edge_count?: number) {
    super(message);
    this.name = 'LayoutError';
  }
}

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
