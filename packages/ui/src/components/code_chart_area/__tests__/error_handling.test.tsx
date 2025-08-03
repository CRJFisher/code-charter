import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary, DefaultErrorFallback } from '../error_boundary';
import { withRetry, ErrorRecovery, LayoutError, errorLogger, errorNotificationManager } from '../error_handling';
import { ErrorNotifications } from '../error_notifications';
import '@testing-library/jest-dom';

describe('Error Handling', () => {
  beforeEach(() => {
    errorLogger.clear();
    errorNotificationManager.dismissAll();
  });

  describe('ErrorBoundary', () => {
    const ThrowError: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>No error</div>;
    };

    // Suppress console errors for error boundary tests
    const originalError = console.error;
    beforeEach(() => {
      console.error = jest.fn();
    });
    afterEach(() => {
      console.error = originalError;
    });

    it('should catch errors and display fallback UI', () => {
      const onError = jest.fn();
      
      render(
        <ErrorBoundary onError={onError}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
      expect(screen.getByText(/Test error/)).toBeInTheDocument();
      expect(onError).toHaveBeenCalled();
    });

    it('should allow retry with retry button', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByText(/Try Again/);
      expect(retryButton).toBeInTheDocument();

      // Click retry - component should re-render
      fireEvent.click(retryButton);

      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('should limit retry attempts', () => {
      const { rerender } = render(
        <ErrorBoundary maxRetries={2}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // First retry
      fireEvent.click(screen.getByText(/Try Again.*1\/2/));
      
      rerender(
        <ErrorBoundary maxRetries={2}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Second retry
      fireEvent.click(screen.getByText(/Try Again.*2\/2/));
      
      rerender(
        <ErrorBoundary maxRetries={2}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // No more retry button
      expect(screen.queryByText(/Try Again/)).not.toBeInTheDocument();
      expect(screen.getByText(/Maximum retry attempts reached/)).toBeInTheDocument();
    });

    it('should use custom fallback component', () => {
      const customFallback = jest.fn((error, errorInfo, retry) => (
        <div>Custom error: {error.message}</div>
      ));

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error: Test error')).toBeInTheDocument();
      expect(customFallback).toHaveBeenCalled();
    });
  });

  describe('withRetry', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await withRetry(operation, {
        maxAttempts: 3,
        delayMs: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Persistent failure');
      });

      await expect(
        withRetry(operation, {
          maxAttempts: 2,
          delayMs: 10,
        })
      ).rejects.toThrow('Persistent failure');

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const operation = jest.fn(async () => {
        throw new Error('Failure');
      });

      try {
        await withRetry(operation, {
          maxAttempts: 2,
          delayMs: 10,
          onRetry,
        });
      } catch {}

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should timeout long operations', async () => {
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'success';
      });

      await expect(
        withRetry(operation, {
          maxAttempts: 1,
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
      const onFallback = jest.fn();

      const result = await ErrorRecovery.tryWithFallback(
        primary,
        fallback,
        onFallback
      );

      expect(result).toBe('fallback result');
      expect(primary).toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
      expect(onFallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should gracefully degrade with default value', () => {
      const operation = jest.fn(() => {
        throw new Error('Operation failed');
      });
      const onError = jest.fn();

      const result = ErrorRecovery.gracefulDegrade(
        operation,
        'default value',
        onError
      );

      expect(result).toBe('default value');
      expect(operation).toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('ErrorLogger', () => {
    it('should log errors with severity', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      errorLogger.log(new Error('Test error'), 'error', { context: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[ERROR]', 'Test error', { context: 'test' });
      expect(errorLogger.getErrors()).toHaveLength(1);
      
      consoleSpy.mockRestore();
    });

    it('should generate error summary', () => {
      errorLogger.log(new LayoutError('Layout failed'), 'error');
      errorLogger.log(new Error('Generic error'), 'warning');
      errorLogger.log(new Error('Info'), 'info');

      const summary = errorLogger.getErrorSummary();
      
      expect(summary.total).toBe(3);
      expect(summary.bySeverity.error).toBe(1);
      expect(summary.bySeverity.warning).toBe(1);
      expect(summary.bySeverity.info).toBe(1);
      expect(summary.byType.get('LayoutError')).toBe(1);
    });

    it('should limit stored errors', () => {
      // Log more than 100 errors
      for (let i = 0; i < 110; i++) {
        errorLogger.log(new Error(`Error ${i}`), 'info');
      }

      expect(errorLogger.getErrors()).toHaveLength(100);
    });
  });

  describe('ErrorNotifications', () => {
    it('should display notifications', async () => {
      render(<ErrorNotifications />);
      
      errorNotificationManager.notify('Test notification', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Test notification')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should dismiss notifications', async () => {
      render(<ErrorNotifications />);
      
      errorNotificationManager.notify('Test notification', 'error');
      
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
      render(<ErrorNotifications />);
      
      errorNotificationManager.notify('Test notification', 'error', [
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
      render(<ErrorNotifications maxNotifications={2} />);
      
      errorNotificationManager.notify('Notification 1', 'info');
      errorNotificationManager.notify('Notification 2', 'warning');
      errorNotificationManager.notify('Notification 3', 'error');
      
      await waitFor(() => {
        expect(screen.getByText('Notification 3')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('Notification 1')).not.toBeInTheDocument();
      expect(screen.getByText('Notification 2')).toBeInTheDocument();
      expect(screen.getByText('Notification 3')).toBeInTheDocument();
    });

    it('should use correct icons and colors', async () => {
      render(<ErrorNotifications />);
      
      errorNotificationManager.notify('Info', 'info');
      errorNotificationManager.notify('Warning', 'warning');
      errorNotificationManager.notify('Error', 'error');
      
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
      expect(error.nodeCount).toBe(100);
      expect(error.edgeCount).toBe(50);
    });
  });
});