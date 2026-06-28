import { Theme, ThemeProvider } from '@code-charter/types';
import { default_themes } from './default_themes';

export class StandaloneThemeProvider implements ThemeProvider {
  private current_theme: Theme;
  private themes: Theme[];
  private listeners: Set<(theme: Theme) => void> = new Set();

  constructor(initial_theme?: Theme) {
    this.themes = [...default_themes];
    this.current_theme = initial_theme || this.get_preferred_theme();
    this.apply_theme(this.current_theme);

    // Track the OS theme only while the user has not made an explicit choice.
    if (typeof window !== 'undefined' && window.matchMedia) {
      const dark_mode_query = window.matchMedia('(prefers-color-scheme: dark)');
      dark_mode_query.addEventListener('change', (e) => {
        if (!this.has_user_preference()) {
          const theme = e.matches ? this.get_dark_theme() : this.get_light_theme();
          this.set_theme(theme);
        }
      });
    }
  }

  get_current_theme(): Theme {
    return this.current_theme;
  }

  set_theme(theme: Theme): void {
    this.current_theme = theme;
    this.apply_theme(theme);
    this.save_theme_preference(theme);
    this.listeners.forEach(listener => listener(theme));
  }

  get_available_themes(): Theme[] {
    return [...this.themes];
  }

  on_theme_change(callback: (theme: Theme) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private apply_theme(theme: Theme): void {
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(this.to_css_var_name(key), value);
    });
    root.setAttribute('data-theme-type', theme.type);
  }

  private to_css_var_name(key: string): string {
    // Mirror VSCode's CSS variable scheme so the same stylesheets work in both modes,
    // e.g. 'editor.background' -> '--vscode-editor-background'.
    return `--vscode-${key.replace(/\./g, '-')}`;
  }

  // Resolution order: saved preference, then OS preference, then dark as the default.
  private get_preferred_theme(): Theme {
    const saved_theme_name = this.get_saved_theme_preference();
    if (saved_theme_name) {
      const saved_theme = this.themes.find(t => t.name === saved_theme_name);
      if (saved_theme) return saved_theme;
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      const prefers_dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefers_dark ? this.get_dark_theme() : this.get_light_theme();
    }

    return this.get_dark_theme();
  }

  private get_dark_theme(): Theme {
    return this.themes.find(t => t.type === 'dark') || default_themes[0];
  }

  private get_light_theme(): Theme {
    return this.themes.find(t => t.type === 'light') || default_themes[1];
  }

  private has_user_preference(): boolean {
    return !!this.get_saved_theme_preference();
  }

  private get_saved_theme_preference(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('code-charter-theme');
    }
    return null;
  }

  private save_theme_preference(theme: Theme): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('code-charter-theme', theme.name);
    }
  }
}
