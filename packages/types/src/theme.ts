/**
 * Theme color definitions that match VSCode theme structure
 */
export interface ThemeColors {
  'editor.background': string;
  'editor.foreground': string;
  'editorWidget.border': string;
}

/**
 * Theme definition with metadata
 */
export interface Theme {
  name: string;
  type: 'light' | 'dark';
  colors: ThemeColors;
}

/**
 * Theme provider interface for different contexts
 */
export interface ThemeProvider {
  /**
   * Get the current theme
   */
  get_current_theme(): Theme;

  /**
   * Set a new theme (only available in standalone mode)
   */
  set_theme?(theme: Theme): void;

  /**
   * Get available themes (only available in standalone mode)
   */
  get_available_themes?(): Theme[];

  /**
   * Subscribe to theme changes
   */
  on_theme_change(callback: (theme: Theme) => void): () => void;
}

