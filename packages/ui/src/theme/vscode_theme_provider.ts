import { Theme, ThemeProvider, ThemeColors } from '@code-charter/types';

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editorWidget.border': '--vscode-editor-widget-border',
};

export class VSCodeThemeProvider implements ThemeProvider {
  private listeners: Set<(theme: Theme) => void> = new Set();
  private observer: MutationObserver | null = null;

  constructor() {
    if (typeof window !== 'undefined' && window.MutationObserver) {
      this.observer = new MutationObserver(() => {
        const theme = this.get_current_theme();
        this.listeners.forEach(listener => listener(theme));
      });

      // VSCode applies the active theme by mutating the documentElement's inline
      // style (CSS variables) and class, so those are the attributes to watch.
      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  get_current_theme(): Theme {
    const colors = {} as ThemeColors;
    const computed_style = window.getComputedStyle(document.documentElement);

    for (const [key, css_var] of Object.entries(CSS_VAR_MAP)) {
      const value = computed_style.getPropertyValue(css_var).trim();
      colors[key as keyof ThemeColors] = value || this.get_default_color(key as keyof ThemeColors);
    }

    const is_dark = this.is_color_dark(colors['editor.background']);

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

  dispose(): void {
    this.observer?.disconnect();
    this.listeners.clear();
  }

  private get_default_color(key: keyof ThemeColors): string {
    // Fallback values mirror VSCode's built-in Dark+ theme for when the
    // corresponding CSS variable has not been injected by the editor yet.
    const defaults: ThemeColors = {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorWidget.border': '#454545',
    };

    return defaults[key] || '#000000';
  }

  private is_color_dark(color: string): boolean {
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);

      // ITU-R BT.601 luma coefficients approximate perceived brightness.
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    }

    // Non-hex / unparseable colors default to dark, matching VSCode's default.
    return true;
  }
}
