import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './error_boundary';
import { ThemeProviderComponent } from '../theme/theme_context';
import '@testing-library/jest-dom';

describe('ErrorBoundary', () => {
  // Mutable so the same child can flip from throwing to rendering across a retry.
  let should_throw = true;
  const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
    if (shouldThrow ?? should_throw) {
      throw new Error('Test error');
    }
    return <div>No error</div>;
  };

  // React logs caught render errors to console.error; silence it so the suite output stays clean.
  const original_error = console.error;
  beforeEach(() => {
    should_throw = true;
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = original_error;
  });

  const render_in_boundary = (ui: React.ReactElement) =>
    render(<ThemeProviderComponent force_standalone>{ui}</ThemeProviderComponent>);

  it('catches errors and displays fallback UI', () => {
    const on_error = jest.fn();

    render_in_boundary(
      <ErrorBoundary on_error={on_error}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    expect(screen.getAllByText(/Test error/).length).toBeGreaterThan(0);
    expect(on_error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('logs the caught error to the console', () => {
    render_in_boundary(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      'React Flow Error Boundary caught an error:',
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('allows retry with the retry button', () => {
    should_throw = true;
    render_in_boundary(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const retry_button = screen.getByText(/Try Again/);
    expect(retry_button).toBeInTheDocument();

    should_throw = false;
    fireEvent.click(retry_button);

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('limits retry attempts', () => {
    const { rerender } = render_in_boundary(
      <ErrorBoundary max_retries={2}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
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
    const custom_fallback = jest.fn((error: Error) => (
      <div>Custom error: {error.message}</div>
    ));

    render_in_boundary(
      <ErrorBoundary fallback={custom_fallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error: Test error')).toBeInTheDocument();
    expect(custom_fallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({ componentStack: expect.any(String) }),
      expect.any(Function)
    );
  });
});
