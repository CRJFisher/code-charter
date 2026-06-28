import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProviderComponent, use_theme } from './theme_context';
import { VSCodeThemeProvider } from './vscode_theme_provider';

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

describe('VSCodeThemeProvider', () => {
  beforeEach(() => {
    // Set up VS Code CSS variables so get_current_theme can read them
    const root = document.documentElement;
    root.style.setProperty('--vscode-editor-background', '#1e1e1e');
    root.style.setProperty('--vscode-editor-foreground', '#d4d4d4');
  });

  afterEach(() => {
    const root = document.documentElement;
    root.style.removeProperty('--vscode-editor-background');
    root.style.removeProperty('--vscode-editor-foreground');
  });

  it('get_current_theme() returns a valid Theme object', () => {
    const provider = new VSCodeThemeProvider();
    const theme = provider.get_current_theme();

    expect(theme).toHaveProperty('name');
    expect(theme).toHaveProperty('type');
    expect(theme).toHaveProperty('colors');
    expect(['light', 'dark']).toContain(theme.type);
    expect(theme.colors['editor.background']).toBeDefined();
    expect(theme.colors['editor.foreground']).toBeDefined();
  });

  it('on_theme_change returns an unsubscribe function', () => {
    const provider = new VSCodeThemeProvider();
    const callback = jest.fn();
    const unsubscribe = provider.on_theme_change(callback);

    expect(typeof unsubscribe).toBe('function');

    // Cleanup
    unsubscribe();
    provider.dispose();
  });
});
