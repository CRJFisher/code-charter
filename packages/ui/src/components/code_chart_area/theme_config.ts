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
      entry_point: string;
    };
    border: {
      default: string;
      selected: string;
      module: string;
    };
    text: {
      default: string;
      entry_point: string;
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
export function get_theme_colors(theme: Theme): ThemeColorConfig {
  const is_dark = theme.type === 'dark';
  
  return {
    node: {
      background: {
        default: is_dark ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        module: is_dark ? '#2d2d30' : '#f3f3f3',
        entry_point: is_dark ? '#1e3a1e' : '#e8f5e9',
      },
      border: {
        default: is_dark ? '#555555' : '#cccccc',
        selected: '#0096FF',
        module: is_dark ? '#454545' : '#d4d4d4',
      },
      text: {
        default: theme.colors['editor.foreground'] || (is_dark ? '#d4d4d4' : '#000000'),
        entry_point: is_dark ? '#4ec9b0' : '#0070c1',
        secondary: is_dark ? '#969696' : '#666666',
        tertiary: is_dark ? '#6c6c6c' : '#999999',
      },
    },
    edge: {
      stroke: is_dark ? '#555555' : '#b1b1b7',
      strokeSelected: '#0096FF',
    },
    cluster: {
      palette: is_dark ? [
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
        overlay: is_dark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        minimap: is_dark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        panel: theme.colors['editor.background'] || (is_dark ? '#1e1e1e' : '#ffffff'),
      },
      border: theme.colors['editorWidget.border'] || (is_dark ? '#454545' : '#cccccc'),
      button: {
        primary: is_dark ? '#0e639c' : '#007acc',
        secondary: is_dark ? '#3a3d41' : '#e1e1e1',
        danger: is_dark ? '#a1260d' : '#d73a49',
        disabled: is_dark ? '#3a3d41' : '#cccccc',
        text: is_dark ? '#ffffff' : '#000000',
      },
      text: {
        primary: theme.colors['editor.foreground'] || (is_dark ? '#d4d4d4' : '#000000'),
        secondary: is_dark ? '#969696' : '#666666',
        white: '#ffffff',
      },
      error: {
        background: is_dark ? '#5a1d1d' : '#fee',
        border: is_dark ? '#be1100' : '#fcc',
        text: is_dark ? '#f48771' : '#c00',
      },
      success: {
        background: is_dark ? '#1d5a1d' : '#efe',
        border: is_dark ? '#00be11' : '#cfc',
        text: is_dark ? '#71f487' : '#0c0',
      },
      warning: {
        background: is_dark ? '#5a5a1d' : '#ffe',
        border: is_dark ? '#bebe00' : '#ffc',
        text: is_dark ? '#f4f471' : '#cc0',
      },
      info: {
        background: is_dark ? '#1d1d5a' : '#eef',
        border: is_dark ? '#0011be' : '#ccf',
        text: is_dark ? '#7187f4' : '#00c',
      },
      loading: {
        spinner: is_dark ? '#888888' : '#666666',
        track: is_dark ? '#2d2d30' : '#f3f3f3',
      },
    },
    shadow: {
      default: is_dark ? '0 2px 8px rgba(0, 0, 0, 0.5)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
      hover: is_dark ? '0 2px 8px rgba(0, 0, 0, 0.7)' : '0 2px 8px rgba(0, 0, 0, 0.15)',
    },
    background: {
      dots: is_dark ? '#2d2d30' : '#e5e5e5',
      grid: is_dark ? '#2d2d30' : '#e5e5e5',
    },
  };
}

/**
 * Get CSS variables for theme colors
 */
function is_string_record(value: unknown): value is { [k: string]: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function get_theme_css_variables(colors: ThemeColorConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  function walk(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      vars[`--flow-${prefix}`] = value;
    } else if (is_string_record(value)) {
      for (const [k, v] of Object.entries(value)) {
        walk(v, `${prefix}-${k}`);
      }
    }
    // Arrays (cluster palette) are intentionally skipped — not representable as a single CSS var
  }

  walk(colors, 'theme');
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