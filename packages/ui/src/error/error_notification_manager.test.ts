import { ErrorNotificationManager, ErrorNotification } from './error_notification_manager';

describe('ErrorNotificationManager', () => {
  it('appends a notification and returns its id', () => {
    const manager = new ErrorNotificationManager();

    const id = manager.notify('Boom', 'error');

    const notifications = manager.get_notifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe(id);
    expect(notifications[0].message).toBe('Boom');
    expect(notifications[0].severity).toBe('error');
    expect(notifications[0].timestamp).toEqual(expect.any(Number));
  });

  it('defaults severity to error', () => {
    const manager = new ErrorNotificationManager();

    manager.notify('No severity given');

    expect(manager.get_notifications()[0].severity).toBe('error');
  });

  it('preserves actions on the notification', () => {
    const manager = new ErrorNotificationManager();
    const action = jest.fn();

    manager.notify('With action', 'warning', [{ label: 'Retry', action }]);

    const [notification] = manager.get_notifications();
    expect(notification.actions?.map(a => a.label)).toEqual(['Retry']);
    notification.actions?.[0].action();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('assigns a distinct id to each notification', () => {
    const manager = new ErrorNotificationManager();

    const first = manager.notify('One', 'error');
    const second = manager.notify('Two', 'error');

    expect(first).not.toBe(second);
    expect(manager.get_notifications()).toHaveLength(2);
  });

  it('dismisses a single notification by id and leaves the rest', () => {
    const manager = new ErrorNotificationManager();
    const first = manager.notify('One', 'error');
    manager.notify('Two', 'error');

    manager.dismiss(first);

    const remaining = manager.get_notifications();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('Two');
  });

  it('ignores dismiss for an unknown id', () => {
    const manager = new ErrorNotificationManager();
    manager.notify('One', 'error');

    manager.dismiss('does-not-exist');

    expect(manager.get_notifications()).toHaveLength(1);
  });

  it('clears every notification on dismiss_all', () => {
    const manager = new ErrorNotificationManager();
    manager.notify('One', 'error');
    manager.notify('Two', 'warning');

    manager.dismiss_all();

    expect(manager.get_notifications()).toEqual([]);
  });

  it('returns a defensive copy from get_notifications', () => {
    const manager = new ErrorNotificationManager();
    manager.notify('One', 'error');

    manager.get_notifications().pop();

    expect(manager.get_notifications()).toHaveLength(1);
  });

  it('notifies subscribers with the current notifications on every change', () => {
    const manager = new ErrorNotificationManager();
    const received: ErrorNotification[][] = [];

    manager.subscribe(notifications => received.push(notifications));
    const id = manager.notify('One', 'error');
    manager.dismiss(id);

    expect(received).toHaveLength(2);
    expect(received[0].map(n => n.message)).toEqual(['One']);
    expect(received[1]).toEqual([]);
  });

  it('stops notifying after a subscriber unsubscribes', () => {
    const manager = new ErrorNotificationManager();
    const listener = jest.fn();

    const unsubscribe = manager.subscribe(listener);
    unsubscribe();
    manager.notify('One', 'error');

    expect(listener).not.toHaveBeenCalled();
  });

  it('hands each subscriber an independent snapshot', () => {
    const manager = new ErrorNotificationManager();
    let captured: ErrorNotification[] = [];

    manager.subscribe(notifications => {
      captured = notifications;
    });
    manager.notify('One', 'error');

    captured.pop();
    expect(manager.get_notifications()).toHaveLength(1);
  });

  describe('auto-dismiss', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('auto-dismisses info notifications after the configured delay', () => {
      const manager = new ErrorNotificationManager(5000);

      manager.notify('Transient', 'info');
      expect(manager.get_notifications()).toHaveLength(1);

      jest.advanceTimersByTime(5000);

      expect(manager.get_notifications()).toEqual([]);
    });

    it('keeps info notifications until the delay elapses', () => {
      const manager = new ErrorNotificationManager(5000);

      manager.notify('Transient', 'info');
      jest.advanceTimersByTime(4999);

      expect(manager.get_notifications()).toHaveLength(1);
    });

    it('does not auto-dismiss warning or error notifications', () => {
      const manager = new ErrorNotificationManager(5000);

      manager.notify('Stay', 'warning');
      manager.notify('Stay too', 'error');
      jest.advanceTimersByTime(60000);

      expect(manager.get_notifications()).toHaveLength(2);
    });

    it('honours a custom auto-dismiss delay', () => {
      const manager = new ErrorNotificationManager(100);

      manager.notify('Transient', 'info');
      jest.advanceTimersByTime(100);

      expect(manager.get_notifications()).toEqual([]);
    });
  });
});
