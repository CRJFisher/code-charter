/**
 * Theme color definitions that match VSCode theme structure
 */
export interface ThemeColors {
  // General Editor Colors
  'editor.background': string;
  'editor.foreground': string;
  'editor.selectionBackground': string;
  'editor.selectionForeground': string;
  'editor.lineHighlightBackground': string;
  'editor.inactiveSelectionBackground': string;
  'editorWidget.border': string;
  'editorLineNumber.foreground': string;
  'editorLineNumber.activeForeground': string;
  'editorGutter.background': string;
  'editorGutter.border': string;
  'editorRuler.foreground': string;
  'editorCursor.foreground': string;
  'editorWhitespace.foreground': string;
  'editorComment.foreground': string;
  'editor.selectionHighlightBackground': string;
  'editorHoverHighlight.background': string;
  'editor.findMatchHighlightBackground': string;
  'editor.findMatchBackground': string;
  'editorBracketMatch.background': string;
  'editorBracketMatch.border': string;
  'editorOverviewRuler.border': string;
  'editorOverviewRuler.background': string;
  
  // Panel and UI Colors
  'panel.border': string;
  
  // Syntax Highlighting Colors
  'editor.keyword.foreground': string;
  'editor.function.foreground': string;
  'editor.variable.foreground': string;
  'editor.string.foreground': string;
  'editor.number.foreground': string;
  'editor.boolean.foreground': string;
  'editor.constant.foreground': string;
  'editor.type.foreground': string;
  'editor.operator.foreground': string;
  'editor.comment.foreground': string;
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

/**
 * Theme context type
 */
export interface ThemeContextValue {
  theme: Theme;
  setTheme?: (theme: Theme) => void;
  availableThemes?: Theme[];
  isStandalone: boolean;
}