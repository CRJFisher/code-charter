import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../../error/error_boundary';
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

  describe('ErrorBoundary', () => {
    // Use a mutable ref so we can change behavior before retry
    let should_throw = true;
    const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
      if (shouldThrow ?? should_throw) {
        throw new Error('Test error');
      }
      return <div>No error</div>;
    };

    // Suppress console errors for error boundary tests
    const originalError = console.error;
    beforeEach(() => {
      should_throw = true;
      console.error = jest.fn();
    });
    afterEach(() => {
      console.error = originalError;
    });

    it('catches errors and displays fallback UI', () => {
      const on_error = jest.fn();

      render(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary on_error={on_error}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
      expect(screen.getAllByText(/Test error/).length).toBeGreaterThan(0);
      expect(on_error).toHaveBeenCalled();
    });

    it('allows retry with the retry button', () => {
      should_throw = true;
      render(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary>
            <ThrowError />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      const retryButton = screen.getByText(/Try Again/);
      expect(retryButton).toBeInTheDocument();

      // Stop throwing before clicking retry so re-render succeeds
      should_throw = false;
      fireEvent.click(retryButton);

      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('limits retry attempts', () => {
      const { rerender } = render(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      fireEvent.click(screen.getByText(/Try Again.*1\/2/));

      rerender(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      fireEvent.click(screen.getByText(/Try Again.*2\/2/));

      rerender(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      expect(screen.queryByText(/Try Again/)).not.toBeInTheDocument();
      expect(screen.getByText(/Maximum retry attempts reached/)).toBeInTheDocument();
    });

    it('uses a custom fallback component', () => {
      const customFallback = jest.fn((error: Error) => (
        <div>Custom error: {error.message}</div>
      ));

      render(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary fallback={customFallback}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      expect(screen.getByText('Custom error: Test error')).toBeInTheDocument();
      expect(customFallback).toHaveBeenCalled();
    });
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