import { Theme } from '@code-charter/types';

/**
 * Theme-aware color configuration for React Flow components
 * Maps theme colors to component-specific colors
 */
export interface ThemeColorConfig {
  // Node colors
  node: {
    background: {
      default: string;
      module: string;
      entryPoint: string;
    };
    border: {
      default: string;
      selected: string;
      module: string;
    };
    text: {
      default: string;
      entryPoint: string;
      secondary: string;
      tertiary: string;
    };
  };
  // Edge colors
  edge: {
    stroke: string;
    strokeSelected: string;
  };
  // UI colors
  ui: {
    background: {
      overlay: string;
      minimap: string;
      panel: string;
    };
    border: string;
    button: {
      primary: string;
      secondary: string;
      danger: string;
      disabled: string;
      text: string;
    };
    text: {
      primary: string;
      secondary: string;
      white: string;
    };
    error: {
      background: string;
      border: string;
      text: string;
    };
    success: {
      background: string;
      border: string;
      text: string;
    };
    warning: {
      background: string;
      border: string;
      text: string;
    };
    info: {
      background: string;
      border: string;
      text: string;
    };
    loading: {
      spinner: string;
      track: string;
    };
  };
  // Shadow effects
  shadow: {
    default: string;
    hover: string;
  };
  // Background patterns
  background: {
    dots: string;
    grid: string;
  };
}

/**
 * Generate theme colors for React Flow based on VSCode theme
 */
export function getThemeColors(theme: Theme): ThemeColorConfig {
  const isDark = theme.type === 'dark';
  
  return {
    node: {
      background: {
        default: isDark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        module: isDark ? '#2d2d30' : '#f3f3f3',
        entryPoint: isDark ? '#1e3a1e' : '#e8f5e9',
      },
      border: {
        default: isDark ? '#555555' : '#cccccc',
        selected: '#0096FF',
        module: isDark ? '#454545' : '#d4d4d4',
      },
      text: {
        default: theme.colors['editor.foreground'] || (isDark ? '#d4d4d4' : '#000000'),
        entryPoint: isDark ? '#4ec9b0' : '#0070c1',
        secondary: isDark ? '#969696' : '#666666',
        tertiary: isDark ? '#6c6c6c' : '#999999',
      },
    },
    edge: {
      stroke: isDark ? '#555555' : '#b1b1b7',
      strokeSelected: '#0096FF',
    },
    ui: {
      background: {
        overlay: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        minimap: isDark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        panel: theme.colors['editor.background'] || (isDark ? '#1e1e1e' : '#ffffff'),
      },
      border: theme.colors['editorWidget.border'] || (isDark ? '#454545' : '#cccccc'),
      button: {
        primary: isDark ? '#0e639c' : '#007acc',
        secondary: isDark ? '#3a3d41' : '#e1e1e1',
        danger: isDark ? '#a1260d' : '#d73a49',
        disabled: isDark ? '#3a3d41' : '#cccccc',
        text: isDark ? '#ffffff' : '#000000',
      },
      text: {
        primary: theme.colors['editor.foreground'] || (isDark ? '#d4d4d4' : '#000000'),
        secondary: isDark ? '#969696' : '#666666',
        white: '#ffffff',
      },
      error: {
        background: isDark ? '#5a1d1d' : '#fee',
        border: isDark ? '#be1100' : '#fcc',
        text: isDark ? '#f48771' : '#c00',
      },
      success: {
        background: isDark ? '#1d5a1d' : '#efe',
        border: isDark ? '#00be11' : '#cfc',
        text: isDark ? '#71f487' : '#0c0',
      },
      warning: {
        background: isDark ? '#5a5a1d' : '#ffe',
        border: isDark ? '#bebe00' : '#ffc',
        text: isDark ? '#f4f471' : '#cc0',
      },
      info: {
        background: isDark ? '#1d1d5a' : '#eef',
        border: isDark ? '#0011be' : '#ccf',
        text: isDark ? '#7187f4' : '#00c',
      },
      loading: {
        spinner: isDark ? '#888888' : '#666666',
        track: isDark ? '#2d2d30' : '#f3f3f3',
      },
    },
    shadow: {
      default: isDark ? '0 2px 8px rgba(0, 0, 0, 0.5)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
      hover: isDark ? '0 2px 8px rgba(0, 0, 0, 0.7)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
    },
    background: {
      dots: isDark ? '#2d2d30' : '#e5e5e5',
      grid: isDark ? '#2d2d30' : '#e5e5e5',
    },
  };
}

/**
 * Get CSS variables for theme colors
 */
export function getThemeCssVariables(colors: ThemeColorConfig): Record<string, string> {
  const vars: Record<string, string> = {};
  
  // Recursively convert nested object to CSS variables
  function addVars(obj: any, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        vars[`--flow-${prefix}-${key}`] = value;
      } else if (typeof value === 'object') {
        addVars(value, `${prefix}-${key}`);
      }
    }
  }
  
  addVars(colors, 'theme');
  return vars;
}