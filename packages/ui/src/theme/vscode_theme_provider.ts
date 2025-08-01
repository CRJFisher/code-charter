import { Theme, ThemeProvider, ThemeColors } from '@code-charter/types';

/**
 * Maps CSS variable names to theme color keys
 */
const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editor.selectionBackground': '--vscode-editor-selectionBackground',
  'editor.selectionForeground': '--vscode-editor-selectionForeground',
  'editor.lineHighlightBackground': '--vscode-editor-lineHighlightBackground',
  'editor.inactiveSelectionBackground': '--vscode-editor-inactiveSelectionBackground',
  'editorWidget.border': '--vscode-editor-widget-border',
  'editorLineNumber.foreground': '--vscode-editorLineNumber-foreground',
  'editorLineNumber.activeForeground': '--vscode-editorLineNumber-activeForeground',
  'editorGutter.background': '--vscode-gutter-background',
  'editorGutter.border': '--vscode-gutter-border',
  'editorRuler.foreground': '--vscode-editor-rulerForeground',
  'editorCursor.foreground': '--vscode-editorCursor-foreground',
  'editorWhitespace.foreground': '--vscode-editorWhitespace-foreground',
  'editorComment.foreground': '--vscode-editorComments-foreground',
  'editor.selectionHighlightBackground': '--vscode-editor-selectionHighlightBackground',
  'editorHoverHighlight.background': '--vscode-editorHoverHighlight-background',
  'editor.findMatchHighlightBackground': '--vscode-editor-findMatchHighlightBackground',
  'editor.findMatchBackground': '--vscode-editor-findMatchBackground',
  'editorBracketMatch.background': '--vscode-editorBracketMatch-background',
  'editorBracketMatch.border': '--vscode-editorBracketMatch-border',
  'editorOverviewRuler.border': '--vscode-editorOverviewRuler-border',
  'editorOverviewRuler.background': '--vscode-editorOverviewRuler-background',
  'panel.border': '--vscode-panel-border',
  'editor.keyword.foreground': '--vscode-editor-keyword-foreground',
  'editor.function.foreground': '--vscode-editor-function-foreground',
  'editor.variable.foreground': '--vscode-editor-variable-foreground',
  'editor.string.foreground': '--vscode-editor-string-foreground',
  'editor.number.foreground': '--vscode-editor-number-foreground',
  'editor.boolean.foreground': '--vscode-editor-boolean-foreground',
  'editor.constant.foreground': '--vscode-editor-constant-foreground',
  'editor.type.foreground': '--vscode-editor-type-foreground',
  'editor.operator.foreground': '--vscode-editor-operator-foreground',
  'editor.comment.foreground': '--vscode-editor-comment-foreground',
};

/**
 * VSCode theme provider that reads theme colors from CSS variables
 */
export class VSCodeThemeProvider implements ThemeProvider {
  private listeners: Set<(theme: Theme) => void> = new Set();
  private observer: MutationObserver | null = null;

  constructor() {
    // Set up mutation observer to detect theme changes
    if (typeof window !== 'undefined' && window.MutationObserver) {
      this.observer = new MutationObserver(() => {
        // Notify listeners when theme changes
        const theme = this.getCurrentTheme();
        this.listeners.forEach(listener => listener(theme));
      });

      // Observe changes to the document element's attributes (where CSS vars are set)
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  getCurrentTheme(): Theme {
    const colors = {} as ThemeColors;
    const computedStyle = window.getComputedStyle(document.documentElement);
    
    // Read all CSS variables
    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
      const value = computedStyle.getPropertyValue(cssVar).trim();
      colors[key as keyof ThemeColors] = value || this.getDefaultColor(key as keyof ThemeColors);
    }
    
    // Determine if it's a light or dark theme based on background color
    const bgColor = colors['editor.background'];
    const isDark = this.isColorDark(bgColor);
    
    return {
      name: 'VSCode Theme',
      type: isDark ? 'dark' : 'light',
      colors
    };
  }

  onThemeChange(callback: (theme: Theme) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.observer?.disconnect();
    this.listeners.clear();
  }

  /**
   * Get default color for a key (fallback when CSS var is not available)
   */
  private getDefaultColor(key: keyof ThemeColors): string {
    // These are fallback colors based on Dark+ theme
    const defaults: Partial<ThemeColors> = {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'panel.border': '#454545',
      // Add more defaults as needed
    };
    
    return defaults[key] || '#000000';
  }

  /**
   * Determine if a color is dark
   */
  private isColorDark(color: string): boolean {
    // Simple heuristic: parse hex color and check luminance
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      
      // Calculate relative luminance
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    }
    
    // Default to dark theme
    return true;
  }
}