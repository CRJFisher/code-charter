import React from 'react';
import { render, act } from '@testing-library/react';
import { ThemeProviderComponent, useTheme } from '../theme_context';
import { VSCodeThemeProvider } from '../vscode_theme_provider';
import { StandaloneThemeProvider } from '../standalone_theme_provider';
import { darkTheme, lightTheme } from '../default_themes';

/**
 * Helper component that consumes the theme context
 */
function ThemeConsumer() {
  const ctx = useTheme();
  return (
    <div>
      <span data-testid="theme-name">{ctx.theme.name}</span>
      <span data-testid="theme-type">{ctx.theme.type}</span>
      <span data-testid="is-standalone">{String(ctx.isStandalone)}</span>
    </div>
  );
}

describe('ThemeProviderComponent', () => {
  // Force standalone mode so the provider does not try to use VS Code APIs
  it('renders children', () => {
    const { getByText } = render(
      <ThemeProviderComponent forceStandalone>
        <div>Test Child</div>
      </ThemeProviderComponent>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('provides theme context to children via useTheme()', () => {
    const { getByTestId } = render(
      <ThemeProviderComponent forceStandalone>
        <ThemeConsumer />
      </ThemeProviderComponent>
    );

    // In standalone / forceStandalone mode the default theme should be present
    expect(getByTestId('theme-name').textContent).toBeTruthy();
    expect(getByTestId('is-standalone').textContent).toBe('true');
  });

  it('throws when useTheme() is used outside the provider', () => {
    // Suppress the React error boundary console output
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ThemeConsumer />)).toThrow(
      'useTheme must be used within a ThemeProvider'
    );

    spy.mockRestore();
  });
});

describe('VSCodeThemeProvider', () => {
  beforeEach(() => {
    // Set up VS Code CSS variables so getCurrentTheme can read them
    const root = document.documentElement;
    root.style.setProperty('--vscode-editor-background', '#1e1e1e');
    root.style.setProperty('--vscode-editor-foreground', '#d4d4d4');
  });

  afterEach(() => {
    const root = document.documentElement;
    root.style.removeProperty('--vscode-editor-background');
    root.style.removeProperty('--vscode-editor-foreground');
  });

  it('getCurrentTheme() returns a valid Theme object', () => {
    const provider = new VSCodeThemeProvider();
    const theme = provider.getCurrentTheme();

    expect(theme).toHaveProperty('name');
    expect(theme).toHaveProperty('type');
    expect(theme).toHaveProperty('colors');
    expect(['light', 'dark']).toContain(theme.type);
    expect(theme.colors['editor.background']).toBeDefined();
    expect(theme.colors['editor.foreground']).toBeDefined();
  });

  it('onThemeChange returns an unsubscribe function', () => {
    const provider = new VSCodeThemeProvider();
    const callback = jest.fn();
    const unsubscribe = provider.onThemeChange(callback);

    expect(typeof unsubscribe).toBe('function');

    // Cleanup
    unsubscribe();
    provider.dispose();
  });
});

describe('StandaloneThemeProvider', () => {
  it('getCurrentTheme() returns the initial theme when provided', () => {
    const provider = new StandaloneThemeProvider(darkTheme);
    const theme = provider.getCurrentTheme();

    expect(theme.name).toBe(darkTheme.name);
    expect(theme.type).toBe('dark');
  });

  it('setTheme() changes the current theme', () => {
    const provider = new StandaloneThemeProvider(darkTheme);
    provider.setTheme(lightTheme);

    const theme = provider.getCurrentTheme();
    expect(theme.name).toBe(lightTheme.name);
    expect(theme.type).toBe('light');
  });

  it('getAvailableThemes() returns at least the default themes', () => {
    const provider = new StandaloneThemeProvider();
    const themes = provider.getAvailableThemes();

    expect(themes.length).toBeGreaterThanOrEqual(2);
    expect(themes.some(t => t.type === 'dark')).toBe(true);
    expect(themes.some(t => t.type === 'light')).toBe(true);
  });

  it('onThemeChange() notifies listeners when theme is set', () => {
    const provider = new StandaloneThemeProvider(darkTheme);
    const callback = jest.fn();
    provider.onThemeChange(callback);

    provider.setTheme(lightTheme);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(lightTheme);
  });

  it('unsubscribe stops notifications', () => {
    const provider = new StandaloneThemeProvider(darkTheme);
    const callback = jest.fn();
    const unsubscribe = provider.onThemeChange(callback);

    unsubscribe();
    provider.setTheme(lightTheme);

    expect(callback).not.toHaveBeenCalled();
  });
});
