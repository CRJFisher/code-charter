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
  private autoDismissDelay: number;

  constructor(autoDismissDelay: number = 5000) {
    this.autoDismissDelay = autoDismissDelay;
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
    this.notifyListeners();

    // Auto-dismiss info notifications after configured delay
    if (severity === 'info') {
      setTimeout(() => this.dismiss(notification.id), this.autoDismissDelay);
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
