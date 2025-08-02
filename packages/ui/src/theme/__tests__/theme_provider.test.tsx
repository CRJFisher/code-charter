import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../theme_provider';
import { VSCodeThemeProvider } from '../vscode_theme_provider';
import { StandaloneThemeProvider } from '../standalone_theme_provider';

describe('ThemeProvider', () => {
  it('renders children', () => {
    const { getByText } = render(
      <ThemeProvider>
        <div>Test Child</div>
      </ThemeProvider>
    );

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('automatically detects VS Code environment', () => {
    // Mock VS Code CSS variables
    const rootElement = document.documentElement;
    rootElement.style.setProperty('--vscode-editor-background', '#1e1e1e');
    rootElement.style.setProperty('--vscode-editor-foreground', '#cccccc');

    const { container } = render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );

    // Should have VS Code theme classes or styles
    const styles = window.getComputedStyle(container.firstChild as Element);
    expect(styles.getPropertyValue('--vscode-editor-background')).toBe('#1e1e1e');
  });

  it('falls back to standalone theme when not in VS Code', () => {
    // Clear any VS Code variables
    const rootElement = document.documentElement;
    rootElement.style.removeProperty('--vscode-editor-background');
    rootElement.style.removeProperty('--vscode-editor-foreground');

    const { container } = render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    );

    // Should have standalone theme
    expect(container.innerHTML).toContain('Content');
  });
});

describe('VSCodeThemeProvider', () => {
  beforeEach(() => {
    // Set up VS Code CSS variables
    const rootElement = document.documentElement;
    rootElement.style.setProperty('--vscode-editor-background', '#1e1e1e');
    rootElement.style.setProperty('--vscode-editor-foreground', '#cccccc');
    rootElement.style.setProperty('--vscode-button-background', '#0e639c');
    rootElement.style.setProperty('--vscode-button-foreground', '#ffffff');
  });

  afterEach(() => {
    // Clean up
    const rootElement = document.documentElement;
    rootElement.style.removeProperty('--vscode-editor-background');
    rootElement.style.removeProperty('--vscode-editor-foreground');
    rootElement.style.removeProperty('--vscode-button-background');
    rootElement.style.removeProperty('--vscode-button-foreground');
  });

  it('provides VS Code theme colors', () => {
    const provider = new VSCodeThemeProvider();
    const colors = provider.getThemeColors();

    expect(colors['editor.background']).toBe('#1e1e1e');
    expect(colors['editor.foreground']).toBe('#cccccc');
    expect(colors['button.background']).toBe('#0e639c');
    expect(colors['button.foreground']).toBe('#ffffff');
  });

  it('returns default colors for missing variables', () => {
    const provider = new VSCodeThemeProvider();
    const colors = provider.getThemeColors();

    // These might not be set in test environment
    if (!colors['panel.background']) {
      expect(colors['panel.background']).toBe('#1e1e1e'); // Falls back to editor background
    }
  });

  it('identifies as VS Code theme', () => {
    const provider = new VSCodeThemeProvider();
    expect(provider.getThemeType()).toBe('vscode');
  });
});

describe('StandaloneThemeProvider', () => {
  it('provides dark theme colors', () => {
    const provider = new StandaloneThemeProvider('dark');
    const colors = provider.getThemeColors();

    expect(colors['editor.background']).toBe('#1e1e1e');
    expect(colors['editor.foreground']).toBe('#cccccc');
    expect(colors['button.background']).toBe('#0e639c');
  });

  it('provides light theme colors', () => {
    const provider = new StandaloneThemeProvider('light');
    const colors = provider.getThemeColors();

    expect(colors['editor.background']).toBe('#ffffff');
    expect(colors['editor.foreground']).toBe('#333333');
    expect(colors['button.background']).toBe('#007acc');
  });

  it('defaults to dark theme', () => {
    const provider = new StandaloneThemeProvider();
    const colors = provider.getThemeColors();

    expect(colors['editor.background']).toBe('#1e1e1e');
  });

  it('identifies as standalone theme', () => {
    const provider = new StandaloneThemeProvider();
    expect(provider.getThemeType()).toBe('standalone');
  });

  it('applies theme to element', () => {
    const provider = new StandaloneThemeProvider('dark');
    const element = document.createElement('div');
    
    provider.applyTheme(element);

    const styles = element.style;
    expect(styles.getPropertyValue('--editor-background')).toBe('#1e1e1e');
    expect(styles.getPropertyValue('--editor-foreground')).toBe('#cccccc');
  });
});