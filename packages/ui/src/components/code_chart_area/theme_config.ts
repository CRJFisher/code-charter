import { Theme } from '@code-charter/types';

/**
 * Theme-aware color configuration for React Flow components
 * Maps theme colors to component-specific colors
 */
export interface ClusterColor {
  background: string;
  border: string;
}

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
  // Cluster palette (12 distinguishable colors)
  cluster: {
    palette: ClusterColor[];
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
    cluster: {
      palette: isDark ? [
        { background: 'rgba(77, 157, 224, 0.20)', border: 'rgba(77, 157, 224, 0.7)' },
        { background: 'rgba(255, 158, 74, 0.20)', border: 'rgba(255, 158, 74, 0.7)' },
        { background: 'rgba(86, 194, 86, 0.20)', border: 'rgba(86, 194, 86, 0.7)' },
        { background: 'rgba(237, 93, 94, 0.20)', border: 'rgba(237, 93, 94, 0.7)' },
        { background: 'rgba(175, 141, 211, 0.20)', border: 'rgba(175, 141, 211, 0.7)' },
        { background: 'rgba(176, 122, 111, 0.20)', border: 'rgba(176, 122, 111, 0.7)' },
        { background: 'rgba(237, 151, 214, 0.20)', border: 'rgba(237, 151, 214, 0.7)' },
        { background: 'rgba(162, 162, 162, 0.20)', border: 'rgba(162, 162, 162, 0.7)' },
        { background: 'rgba(214, 215, 78, 0.20)', border: 'rgba(214, 215, 78, 0.7)' },
        { background: 'rgba(73, 213, 226, 0.20)', border: 'rgba(73, 213, 226, 0.7)' },
        { background: 'rgba(77, 118, 188, 0.20)', border: 'rgba(77, 118, 188, 0.7)' },
        { background: 'rgba(255, 210, 162, 0.20)', border: 'rgba(255, 210, 162, 0.7)' },
      ] : [
        { background: 'rgba(31, 119, 180, 0.15)', border: 'rgba(31, 119, 180, 0.6)' },
        { background: 'rgba(255, 127, 14, 0.15)', border: 'rgba(255, 127, 14, 0.6)' },
        { background: 'rgba(44, 160, 44, 0.15)', border: 'rgba(44, 160, 44, 0.6)' },
        { background: 'rgba(214, 39, 40, 0.15)', border: 'rgba(214, 39, 40, 0.6)' },
        { background: 'rgba(148, 103, 189, 0.15)', border: 'rgba(148, 103, 189, 0.6)' },
        { background: 'rgba(140, 86, 75, 0.15)', border: 'rgba(140, 86, 75, 0.6)' },
        { background: 'rgba(227, 119, 194, 0.15)', border: 'rgba(227, 119, 194, 0.6)' },
        { background: 'rgba(127, 127, 127, 0.15)', border: 'rgba(127, 127, 127, 0.6)' },
        { background: 'rgba(188, 189, 34, 0.15)', border: 'rgba(188, 189, 34, 0.6)' },
        { background: 'rgba(23, 190, 207, 0.15)', border: 'rgba(23, 190, 207, 0.6)' },
        { background: 'rgba(31, 70, 144, 0.15)', border: 'rgba(31, 70, 144, 0.6)' },
        { background: 'rgba(255, 187, 120, 0.15)', border: 'rgba(255, 187, 120, 0.6)' },
      ],
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

/**
 * Get the color pair for a given cluster index (wraps around the palette).
 */
export function get_cluster_color(
  colors: ThemeColorConfig,
  cluster_index: number
): ClusterColor {
  const palette = colors.cluster.palette;
  // Guard against negative indices (JS modulo returns negative for negative operands)
  return palette[((cluster_index % palette.length) + palette.length) % palette.length];
}