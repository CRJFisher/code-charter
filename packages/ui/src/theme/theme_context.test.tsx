import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProviderComponent, use_theme } from './theme_context';

/**
 * Helper component that consumes the theme context
 */
function ThemeConsumer() {
  const ctx = use_theme();
  return (
    <div>
      <span data-testid="theme-name">{ctx.theme.name}</span>
      <span data-testid="theme-type">{ctx.theme.type}</span>
      <span data-testid="is-standalone">{String(ctx.is_standalone)}</span>
    </div>
  );
}

describe('ThemeProviderComponent', () => {
  // Force standalone mode so the provider does not try to use VS Code APIs
  it('renders children', () => {
    const { getByText } = render(
      <ThemeProviderComponent force_standalone>
        <div>Test Child</div>
      </ThemeProviderComponent>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('provides theme context to children via use_theme()', () => {
    const { getByTestId } = render(
      <ThemeProviderComponent force_standalone>
        <ThemeConsumer />
      </ThemeProviderComponent>
    );

    // In standalone / force_standalone mode the default theme should be present
    expect(getByTestId('theme-name').textContent).toBeTruthy();
    expect(getByTestId('is-standalone').textContent).toBe('true');
  });

  it('throws when use_theme() is used outside the provider', () => {
    // Suppress the React error boundary console output
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {
      // silence React's expected error log during this test
    });

    expect(() => render(<ThemeConsumer />)).toThrow(
      'use_theme must be used within a ThemeProvider'
    );

    spy.mockRestore();
  });
});
