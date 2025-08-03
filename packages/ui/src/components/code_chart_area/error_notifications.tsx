import React, { useEffect, useState } from 'react';
import { errorNotificationManager, ErrorNotification } from './error_handling';

export interface ErrorNotificationsProps {
  position?: 'top' | 'bottom';
  maxNotifications?: number;
}

export const ErrorNotifications: React.FC<ErrorNotificationsProps> = ({
  position = 'bottom',
  maxNotifications = 3,
}) => {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = errorNotificationManager.subscribe((newNotifications) => {
      setNotifications(newNotifications.slice(-maxNotifications));
    });

    // Get initial notifications
    setNotifications(errorNotificationManager.getNotifications().slice(-maxNotifications));

    return unsubscribe;
  }, [maxNotifications]);

  if (notifications.length === 0) {
    return null;
  }

  const containerStyles: React.CSSProperties = {
    position: 'fixed',
    [position]: '20px',
    right: '20px',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '400px',
  };

  return (
    <div style={containerStyles} role="alert" aria-live="polite">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => errorNotificationManager.dismiss(notification.id)}
        />
      ))}
    </div>
  );
};

interface NotificationItemProps {
  notification: ErrorNotification;
  onDismiss: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 300);
  };

  const getBackgroundColor = () => {
    switch (notification.severity) {
      case 'info':
        return '#e3f2fd';
      case 'warning':
        return '#fff3e0';
      case 'error':
        return '#ffebee';
      default:
        return '#f5f5f5';
    }
  };

  const getBorderColor = () => {
    switch (notification.severity) {
      case 'info':
        return '#2196F3';
      case 'warning':
        return '#ff9800';
      case 'error':
        return '#f44336';
      default:
        return '#ccc';
    }
  };

  const getIcon = () => {
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

  const itemStyles: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: getBackgroundColor(),
    border: `1px solid ${getBorderColor()}`,
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    opacity: isExiting ? 0 : 1,
    transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
    transition: 'all 0.3s ease',
  };

  return (
    <div style={itemStyles}>
      <span style={{ fontSize: '20px', flexShrink: 0 }}>{getIcon()}</span>
      
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: notification.actions ? '8px' : 0 }}>
          {notification.message}
        </div>
        
        {notification.actions && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {notification.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => {
                  action.action();
                  handleDismiss();
                }}
                style={{
                  padding: '4px 12px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${getBorderColor()}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: getBorderColor(),
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = getBorderColor();
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = getBorderColor();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          fontSize: '16px',
          color: '#666',
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
export function useErrorNotification() {
  const notify = React.useCallback((
    message: string,
    severity: 'info' | 'warning' | 'error' = 'error',
    actions?: ErrorNotification['actions']
  ) => {
    return errorNotificationManager.notify(message, severity, actions);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    errorNotificationManager.dismiss(id);
  }, []);

  const dismissAll = React.useCallback(() => {
    errorNotificationManager.dismissAll();
  }, []);

  return { notify, dismiss, dismissAll };
}