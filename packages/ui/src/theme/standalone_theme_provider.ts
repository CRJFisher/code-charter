import { Theme, ThemeProvider } from '@code-charter/types';
import { defaultThemes } from './default_themes';

/**
 * Standalone theme provider for non-VSCode contexts
 */
export class StandaloneThemeProvider implements ThemeProvider {
  private currentTheme: Theme;
  private themes: Theme[];
  private listeners: Set<(theme: Theme) => void> = new Set();

  constructor(initialTheme?: Theme) {
    this.themes = [...defaultThemes];
    this.currentTheme = initialTheme || this.getPreferredTheme();
    
    // Apply theme CSS variables
    this.applyTheme(this.currentTheme);
    
    // Listen for system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeQuery.addEventListener('change', (e) => {
        if (!this.hasUserPreference()) {
          const theme = e.matches ? this.getDarkTheme() : this.getLightTheme();
          this.setTheme(theme);
        }
      });
    }
  }

  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    this.applyTheme(theme);
    this.saveThemePreference(theme);
    
    // Notify listeners
    this.listeners.forEach(listener => listener(theme));
  }

  getAvailableThemes(): Theme[] {
    return [...this.themes];
  }

  addTheme(theme: Theme): void {
    this.themes.push(theme);
  }

  onThemeChange(callback: (theme: Theme) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Apply theme by setting CSS variables
   */
  private applyTheme(theme: Theme): void {
    const root = document.documentElement;
    
    // Apply each color as a CSS variable
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = this.toCssVarName(key);
      root.style.setProperty(cssVarName, value);
    });
    
    // Set theme type attribute for additional styling
    root.setAttribute('data-theme-type', theme.type);
  }

  /**
   * Convert theme color key to CSS variable name
   */
  private toCssVarName(key: string): string {
    // Convert dot notation to dash notation
    // e.g., 'editor.background' -> '--vscode-editor-background'
    return `--vscode-${key.replace(/\./g, '-')}`;
  }

  /**
   * Get preferred theme based on user preference or system settings
   */
  private getPreferredTheme(): Theme {
    // Check local storage for saved preference
    const savedThemeName = this.getSavedThemePreference();
    if (savedThemeName) {
      const savedTheme = this.themes.find(t => t.name === savedThemeName);
      if (savedTheme) return savedTheme;
    }
    
    // Check system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? this.getDarkTheme() : this.getLightTheme();
    }
    
    // Default to dark theme
    return this.getDarkTheme();
  }

  private getDarkTheme(): Theme {
    return this.themes.find(t => t.type === 'dark') || defaultThemes[0];
  }

  private getLightTheme(): Theme {
    return this.themes.find(t => t.type === 'light') || defaultThemes[1];
  }

  private hasUserPreference(): boolean {
    return !!this.getSavedThemePreference();
  }

  private getSavedThemePreference(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('code-charter-theme');
    }
    return null;
  }

  private saveThemePreference(theme: Theme): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('code-charter-theme', theme.name);
    }
  }
}