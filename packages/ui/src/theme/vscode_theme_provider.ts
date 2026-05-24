import { Theme, ThemeProvider, ThemeColors } from '@code-charter/types';

/**
 * Maps CSS variable names to theme color keys
 */
const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editorWidget.border': '--vscode-editor-widget-border',
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
        const theme = this.get_current_theme();
        this.listeners.forEach(listener => listener(theme));
      });

      // Observe changes to the document element's attributes (where CSS vars are set)
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  get_current_theme(): Theme {
    const colors = {} as ThemeColors;
    const computed_style = window.getComputedStyle(document.documentElement);
    
    // Read all CSS variables
    for (const [key, css_var] of Object.entries(CSS_VAR_MAP)) {
      const value = computed_style.getPropertyValue(css_var).trim();
      colors[key as keyof ThemeColors] = value || this.get_default_color(key as keyof ThemeColors);
    }
    
    // Determine if it's a light or dark theme based on background color
    const bg_color = colors['editor.background'];
    const is_dark = this.is_color_dark(bg_color);
    
    return {
      name: 'VSCode Theme',
      type: is_dark ? 'dark' : 'light',
      colors
    };
  }

  on_theme_change(callback: (theme: Theme) => void): () => void {
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
  private get_default_color(key: keyof ThemeColors): string {
    // These are fallback colors based on Dark+ theme
    const defaults: ThemeColors = {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorWidget.border': '#454545',
    };
    
    return defaults[key] || '#000000';
  }

  /**
   * Determine if a color is dark
   */
  private is_color_dark(color: string): boolean {
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