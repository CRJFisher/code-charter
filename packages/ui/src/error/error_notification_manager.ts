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
  private auto_dismiss_delay: number;

  constructor(auto_dismiss_delay = 5000) {
    this.auto_dismiss_delay = auto_dismiss_delay;
  }

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
    this.notify_listeners();

    if (severity === 'info') {
      setTimeout(() => this.dismiss(notification.id), this.auto_dismiss_delay);
    }

    return notification.id;
  }

  dismiss(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notify_listeners();
  }

  dismiss_all() {
    this.notifications = [];
    this.notify_listeners();
  }

  subscribe(listener: (notifications: ErrorNotification[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify_listeners() {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }

  get_notifications() {
    return [...this.notifications];
  }
}

export const error_notification_manager = new ErrorNotificationManager();
