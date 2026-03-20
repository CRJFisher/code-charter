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
  getCurrentTheme(): Theme;
  
  /**
   * Set a new theme (only available in standalone mode)
   */
  setTheme?(theme: Theme): void;
  
  /**
   * Get available themes (only available in standalone mode)
   */
  getAvailableThemes?(): Theme[];
  
  /**
   * Subscribe to theme changes
   */
  onThemeChange(callback: (theme: Theme) => void): () => void;
}

