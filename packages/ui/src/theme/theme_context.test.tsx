import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProviderComponent, use_theme } from './theme_context';
import { VSCodeThemeProvider } from './vscode_theme_provider';
import { StandaloneThemeProvider } from './standalone_theme_provider';
import { dark_theme, light_theme } from './default_themes';

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

describe('StandaloneThemeProvider', () => {
  it('get_current_theme() returns the initial theme when provided', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const theme = provider.get_current_theme();

    expect(theme.name).toBe(dark_theme.name);
    expect(theme.type).toBe('dark');
  });

  it('set_theme() changes the current theme', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    provider.set_theme(light_theme);

    const theme = provider.get_current_theme();
    expect(theme.name).toBe(light_theme.name);
    expect(theme.type).toBe('light');
  });

  it('get_available_themes() returns at least the default themes', () => {
    const provider = new StandaloneThemeProvider();
    const themes = provider.get_available_themes();

    expect(themes.length).toBeGreaterThanOrEqual(2);
    expect(themes.some(t => t.type === 'dark')).toBe(true);
    expect(themes.some(t => t.type === 'light')).toBe(true);
  });

  it('on_theme_change() notifies listeners when theme is set', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const callback = jest.fn();
    provider.on_theme_change(callback);

    provider.set_theme(light_theme);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(light_theme);
  });

  it('unsubscribe stops notifications', () => {
    const provider = new StandaloneThemeProvider(dark_theme);
    const callback = jest.fn();
    const unsubscribe = provider.on_theme_change(callback);

    unsubscribe();
    provider.set_theme(light_theme);

    expect(callback).not.toHaveBeenCalled();
  });
});
