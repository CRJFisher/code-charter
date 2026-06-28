import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { with_retry, ErrorRecovery, LayoutError, error_logger, error_notification_manager, handle_react_flow_error } from './error_handling';
import { ErrorNotifications } from '../../error/error_notifications';
import { ThemeProviderComponent } from '../../theme/theme_context';
import '@testing-library/jest-dom';

const render_with_theme = (ui: React.ReactElement) => {
  return render(
    <ThemeProviderComponent force_standalone>
      {ui}
    </ThemeProviderComponent>
  );
};

describe('Error Handling', () => {
  beforeEach(() => {
    error_logger.clear();
    error_notification_manager.dismiss_all();
  });

  describe('with_retry', () => {
    it('returns immediately when the operation succeeds on the first attempt', async () => {
      const operation = jest.fn(async () => 'success');

      const result = await with_retry(operation, { max_attempts: 3, delay_ms: 10 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries failed operations', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await with_retry(operation, {
        max_attempts: 3,
        delay_ms: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('throws after max attempts', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Persistent failure');
      });

      await expect(
        with_retry(operation, {
          max_attempts: 2,
          delay_ms: 10,
        })
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('calls the on_retry callback', async () => {
      const on_retry = jest.fn();
      const operation = jest.fn(async () => {
        throw new Error('Failure');
      });

      try {
        await with_retry(operation, {
          max_attempts: 2,
          delay_ms: 10,
          on_retry,
        });
      } catch {
        // expected — assertions below check the retry side-effects
      }

      expect(on_retry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('times out long operations', async () => {
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'success';
      });

      await expect(
        with_retry(operation, {
          max_attempts: 1,
          timeout: 50,
        })
      ).rejects.toThrow(/timed out/);
    });
  });

  describe('ErrorRecovery', () => {
    it('tries the fallback on primary failure', async () => {
      const primary = jest.fn(async () => {
        throw new Error('Primary failed');
      });
      const fallback = jest.fn(async () => 'fallback result');
      const on_fallback = jest.fn();

      const result = await ErrorRecovery.try_with_fallback(
        primary,
        fallback,
        on_fallback
      );

      expect(result).toBe('fallback result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
      expect(on_fallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('returns primary result when primary succeeds without invoking fallback', async () => {
      const primary = jest.fn(async () => 'primary result');
      const fallback = jest.fn(async () => 'fallback result');

      const result = await ErrorRecovery.try_with_fallback(primary, fallback);

      expect(result).toBe('primary result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });
  });

  describe('ErrorNotifications', () => {
    it('displays notifications', async () => {
      render_with_theme(<ErrorNotifications />);
      
      error_notification_manager.notify('Test notification', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('dismisses notifications', async () => {
      render_with_theme(<ErrorNotifications />);
      
      error_notification_manager.notify('Test notification', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument();
      });
      
      const dismissButton = screen.getByLabelText('Dismiss notification');
      fireEvent.click(dismissButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Test notification')).not.toBeInTheDocument();
      });
    });

    it('shows action buttons', async () => {
      const action = jest.fn();
      render_with_theme(<ErrorNotifications />);
      
      error_notification_manager.notify('Test notification', 'error', [
        { label: 'Retry', action },
      ]);
      
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument();
      });
      
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);
      
      expect(action).toHaveBeenCalled();
    });

    it('limits displayed notifications', async () => {
      render_with_theme(<ErrorNotifications max_notifications={2} />);
      
      error_notification_manager.notify('Notification 1', 'info');
      error_notification_manager.notify('Notification 2', 'warning');
      error_notification_manager.notify('Notification 3', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Notification 3')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
      expect(screen.getByText('Notification 3')).toBeInTheDocument();
    });

    it('uses correct icons and colors', async () => {
      render_with_theme(<ErrorNotifications />);
      
      error_notification_manager.notify('Info', 'info');
      error_notification_manager.notify('Warning', 'warning');
      error_notification_manager.notify('Error', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Info')).toBeInTheDocument();
        expect(screen.getByText('Warning')).toBeInTheDocument();
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
      
      expect(screen.getByText('ℹ️')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
    });
  });

  describe('Custom Error Types', () => {
    it('creates LayoutError with metadata', () => {
      const error = new LayoutError('Layout failed', 100, 50);

      expect(error.name).toBe('LayoutError');
      expect(error.message).toBe('Layout failed');
      expect(error.node_count).toBe(100);
      expect(error.edge_count).toBe(50);
    });
  });

  describe('handle_react_flow_error', () => {
    it('maps undefined-property reads to a warning with a reload action', () => {
      handle_react_flow_error(new Error("Cannot read properties of undefined (reading 'x')"));

      const [notification] = error_notification_manager.get_notifications();
      expect(notification.message).toBe('Data loading error. Some nodes may not be displayed correctly.');
      expect(notification.severity).toBe('warning');
      expect(notification.actions?.map(a => a.label)).toEqual(['Reload']);
    });

    it('maps update-depth overflows to an error notification', () => {
      handle_react_flow_error(new Error('Maximum update depth exceeded'));

      const [notification] = error_notification_manager.get_notifications();
      expect(notification.message).toBe('Performance issue detected. Try reducing the number of nodes.');
      expect(notification.severity).toBe('error');
      expect(notification.actions).toBeUndefined();
    });

    it('maps ELK layout failures to a fallback-layout warning', () => {
      handle_react_flow_error(new Error('ELK layout failed'));

      const [notification] = error_notification_manager.get_notifications();
      expect(notification.message).toBe('Layout calculation failed. Using fallback layout.');
      expect(notification.severity).toBe('warning');
    });

    it('maps unrecognised errors to a dismissible unexpected-error notification', () => {
      handle_react_flow_error(new Error('Something weird happened'));

      const [notification] = error_notification_manager.get_notifications();
      expect(notification.message).toBe('Unexpected error: Something weird happened');
      expect(notification.severity).toBe('error');
      expect(notification.actions?.map(a => a.label)).toEqual(['Dismiss']);

      const dismiss = notification.actions?.find(a => a.label === 'Dismiss');
      expect(() => dismiss?.action()).not.toThrow();
    });
  });
});