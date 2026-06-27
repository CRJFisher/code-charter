import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../../error/error_boundary';
import { with_retry, ErrorRecovery, LayoutError, error_logger, error_notification_manager } from './error_handling';
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

    it('should catch errors and display fallback UI', () => {
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

    it('should allow retry with retry button', () => {
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

    it('should limit retry attempts', () => {
      const { rerender } = render(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      // First retry
      fireEvent.click(screen.getByText(/Try Again.*1\/2/));

      rerender(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      // Second retry
      fireEvent.click(screen.getByText(/Try Again.*2\/2/));

      rerender(
        <ThemeProviderComponent force_standalone>
          <ErrorBoundary max_retries={2}>
            <ThrowError shouldThrow={true} />
          </ErrorBoundary>
        </ThemeProviderComponent>
      );

      // No more retry button
      expect(screen.queryByText(/Try Again/)).not.toBeInTheDocument();
      expect(screen.getByText(/Maximum retry attempts reached/)).toBeInTheDocument();
    });

    it('should use custom fallback component', () => {
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

    it('should retry failed operations', async () => {
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

    it('should throw after max attempts', async () => {
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

    it('should call on_retry callback', async () => {
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

    it('should timeout long operations', async () => {
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
    it('should try fallback on primary failure', async () => {
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

  describe('ErrorLogger', () => {
    it('should log errors with severity', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      error_logger.log(new Error('Test error'), 'error', { context: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[ERROR]', 'Test error', { context: 'test' });
      expect(error_logger.get_errors()).toHaveLength(1);
      
      consoleSpy.mockRestore();
    });

    it('should generate error summary', () => {
      error_logger.log(new LayoutError('Layout failed'), 'error');
      error_logger.log(new Error('Generic error'), 'warning');
      error_logger.log(new Error('Info'), 'info');

      const summary = error_logger.get_error_summary();
      
      expect(summary.total).toBe(3);
      expect(summary.by_severity.error).toBe(1);
      expect(summary.by_severity.warning).toBe(1);
      expect(summary.by_severity.info).toBe(1);
      expect(summary.by_type.get('LayoutError')).toBe(1);
    });

    it('should limit stored errors', () => {
      // Log more than 100 errors
      for (let i = 0; i < 110; i++) {
        error_logger.log(new Error(`Error ${i}`), 'info');
      }

      expect(error_logger.get_errors()).toHaveLength(100);
    });
  });

  describe('ErrorNotifications', () => {
    it('should display notifications', async () => {
      render_with_theme(<ErrorNotifications />);
      
      error_notification_manager.notify('Test notification', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should dismiss notifications', async () => {
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

    it('should show action buttons', async () => {
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

    it('should limit displayed notifications', async () => {
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

    it('should use correct icons and colors', async () => {
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
    it('should create LayoutError with metadata', () => {
      const error = new LayoutError('Layout failed', 100, 50);
      
      expect(error.name).toBe('LayoutError');
      expect(error.message).toBe('Layout failed');
      expect(error.node_count).toBe(100);
      expect(error.edge_count).toBe(50);
    });
  });
});