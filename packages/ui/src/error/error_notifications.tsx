import React, { useEffect, useState } from 'react';
import { error_notification_manager, ErrorNotification } from './error_notification_manager';
import { CONFIG } from '../components/code_chart_area/chart_config';
import { use_flow_theme_styles } from '../components/code_chart_area/use_chart_theme_styles';

export interface ErrorNotificationsProps {
  position?: 'top' | 'bottom';
  max_notifications?: number;
}

export const ErrorNotifications: React.FC<ErrorNotificationsProps> = ({
  position = 'bottom',
  max_notifications = 3,
}) => {
  const [notifications, set_notifications] = useState<ErrorNotification[]>([]);

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = error_notification_manager.subscribe((new_notifications) => {
      set_notifications(new_notifications.slice(-max_notifications));
    });

    // Get initial notifications
    set_notifications(error_notification_manager.get_notifications().slice(-max_notifications));

    return unsubscribe;
  }, [max_notifications]);

  if (notifications.length === 0) {
    return null;
  }

  const container_styles: React.CSSProperties = {
    position: 'fixed',
    [position]: `${CONFIG.spacing.padding.xlarge}px`,
    right: `${CONFIG.spacing.padding.xlarge}px`,
    zIndex: CONFIG.zIndex.notifications,
    display: 'flex',
    flexDirection: 'column',
    gap: `${CONFIG.spacing.margin.medium + 2}px`,
    maxWidth: '400px',
  };

  return (
    <div style={container_styles} role="alert" aria-live="polite">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          on_dismiss={() => error_notification_manager.dismiss(notification.id)}
        />
      ))}
    </div>
  );
};

interface NotificationItemProps {
  notification: ErrorNotification;
  on_dismiss: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, on_dismiss }) => {
  const [is_exiting, set_is_exiting] = useState(false);
  const theme_styles = use_flow_theme_styles();

  const handle_dismiss = () => {
    set_is_exiting(true);
    setTimeout(on_dismiss, 300);
  };

  const get_background_color = () => {
    switch (notification.severity) {
      case 'info':
        return theme_styles.colors.ui.info.background;
      case 'warning':
        return theme_styles.colors.ui.warning.background;
      case 'error':
        return theme_styles.colors.ui.error.background;
      default:
        return theme_styles.colors.ui.background.panel;
    }
  };

  const get_border_color = () => {
    switch (notification.severity) {
      case 'info':
        return theme_styles.colors.ui.info.border;
      case 'warning':
        return theme_styles.colors.ui.warning.border;
      case 'error':
        return theme_styles.colors.ui.error.border;
      default:
        return theme_styles.colors.ui.border;
    }
  };

  const get_icon = () => {
    switch (notification.severity) {
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return '📢';
    }
  };

  const item_styles: React.CSSProperties = {
    padding: `${CONFIG.spacing.padding.medium + 4}px ${CONFIG.spacing.padding.large}px`,
    backgroundColor: get_background_color(),
    border: `1px solid ${get_border_color()}`,
    borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
    boxShadow: theme_styles.colors.shadow.default,
    display: 'flex',
    alignItems: 'flex-start',
    gap: `${CONFIG.spacing.padding.medium + 4}px`,
    opacity: is_exiting ? 0 : 1,
    transform: is_exiting ? 'translateX(100%)' : 'translateX(0)',
    transition: 'all 0.3s ease',
  };

  return (
    <div style={item_styles}>
      <span style={{ fontSize: `${CONFIG.spacing.fontSize.xlarge + 2}px`, flexShrink: 0 }}>{get_icon()}</span>
      
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: notification.actions ? `${CONFIG.spacing.margin.medium}px` : 0 }}>
          {notification.message}
        </div>
        
        {notification.actions && (
          <div style={{ display: 'flex', gap: `${CONFIG.spacing.margin.medium}px` }}>
            {notification.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  action.action();
                  handle_dismiss();
                }}
                style={{
                  padding: `${CONFIG.spacing.padding.small}px ${CONFIG.spacing.padding.medium + 4}px`,
                  backgroundColor: 'transparent',
                  border: `1px solid ${get_border_color()}`,
                  borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
                  cursor: 'pointer',
                  fontSize: `${CONFIG.spacing.fontSize.medium}px`,
                  color: get_border_color(),
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = get_border_color();
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = get_border_color();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <button
        onClick={handle_dismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: `${CONFIG.spacing.padding.small}px`,
          fontSize: `${CONFIG.spacing.fontSize.large}px`,
          color: theme_styles.colors.ui.text.secondary,
          flexShrink: 0,
        }}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
};

// Hook for using error notifications
export function use_error_notification() {
  const notify = React.useCallback((
    message: string,
    severity: 'info' | 'warning' | 'error' = 'error',
    actions?: ErrorNotification['actions']
  ) => {
    return error_notification_manager.notify(message, severity, actions);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    error_notification_manager.dismiss(id);
  }, []);

  const dismiss_all = React.useCallback(() => {
    error_notification_manager.dismiss_all();
  }, []);

  return { notify, dismiss, dismiss_all };
}