// Configuration constants for React Flow code visualization
// Note: Color values in this file are defaults. Actual colors are theme-aware
// and are provided by the theme system based on the current VSCode theme.

// Layout Configuration
const LAYOUT_CONFIG = {
  // ELK Layout Options
  elk: {
    algorithm: 'layered',
    direction: 'DOWN',
    spacing: {
      nodeNode: 50,
      nodeNodeBetweenLayers: 100,
      edgeNodeBetweenLayers: 30,
    },
    edgeRouting: 'ORTHOGONAL',
    unnecessaryBendpoints: 'true',
    nodePlacement: {
      strategy: 'NETWORK_SIMPLEX',
    },
  },
  // Fallback Grid Layout
  grid: {
    spacingX: 300,
    spacingY: 200,
  },
  // Retry Configuration
  retry: {
    max_attempts: 2,
    delay_ms: 500,
  },
  // Module compound-node geometry. innerPadding is the gap between the
  // module border and its child function nodes on left/right/bottom. The
  // top gap is innerPadding + headerHeight to leave room for the title bar.
  module: {
    innerPadding: 40,
    headerHeight: 30,
  },
} as const;

// Node Configuration
const NODE_CONFIG = {
  // Default Dimensions
  default: {
    width: 250,
    height: 120,
  },
  // Size Constraints
  constraints: {
    min_width: 200,
    max_width: 350,
  },
  // Text Metrics
  text: {
    base_padding: 20,
    char_width: 8,
    line_height: 20,
  },
  // Visual Properties
  visual: {
    borderWidth: {
      default: 2,
      selected: 3,
    },
    scale: {
      hover: 1.05,
    },
  },
} as const;

// Zoom Configuration
const ZOOM_CONFIG = {
  // Zoom Levels
  levels: {
    min: 0.1,
    max: 2.5,
    threshold: 0.45,
  },
} as const;

// Animation Configuration
const ANIMATION_CONFIG = {
  // Durations (in ms)
  duration: {
    fit_view: 500,
    panToNode: 300,
    saveDelay: 100,
  },
  // Debounce/Throttle
  debounce: {
    viewport: 100,
  },
} as const;

// Performance Configuration
const PERFORMANCE_CONFIG = {
  // Node Count Thresholds
  nodes: {
    largeGraph: 200,
    showStats: 100,
    hideIndicator: 50,
  },
  // Virtual Rendering
  virtualRender: {
    render_buffer: 25,
    defaultBuffer: 50,
  },
} as const;


// UI Spacing Configuration
const SPACING_CONFIG = {
  // Padding
  padding: {
    small: 4,
    medium: 8,
    large: 16,
    xlarge: 20,
  },
  // Margins
  margin: {
    small: 4,
    medium: 8,
    large: 15,
    xlarge: 20,
  },
  // Border Radius
  borderRadius: {
    small: 3,
    medium: 4,
    large: 8,
  },
  // Font Sizes
  fontSize: {
    small: 11,
    medium: 12,
    large: 16,
    xlarge: 18,
  },
} as const;

// Error Handling Configuration
const ERROR_CONFIG = {
  // Retry
  retry: {
    max_retries: 3,
    timeout: 30000,
  },
  // Notifications
  notifications: {
    max_notifications: 3,
    auto_dismiss_delay: 5000,
  },
  // Error Log
  errorLog: {
    maxErrors: 100,
  },
} as const;

// MiniMap Configuration
const MINIMAP_CONFIG = {
  nodeStrokeWidth: 3,
  colors: {
    moduleGroup: '#e0e0e0',
    entry_point: '#4caf50',
    selected: '#0096FF',
    default: '#ff0072',
  },
} as const;

// Background Configuration
const BACKGROUND_CONFIG = {
  variant: 'dots' as const,
  gap: 12,
  size: 1,
} as const;

// Viewport Configuration
const VIEWPORT_CONFIG = {
  fit_view: {
    padding: 0.2,
  },
  indicators: {
    position: {
      offset: 20,
      transform: {
        horizontal: 'translateX(-50%)',
        vertical: 'translateY(-50%)',
      },
    },
  },
} as const;

// Z-Index Layers
const Z_INDEX = {
  background: 0,
  nodes: 1,
  edges: 2,
  controls: 5,
  overlay: 10,
  notifications: 1000,
} as const;

// Export all configurations as a single object for convenience
export const CONFIG = {
  layout: LAYOUT_CONFIG,
  node: NODE_CONFIG,
  zoom: ZOOM_CONFIG,
  animation: ANIMATION_CONFIG,
  performance: PERFORMANCE_CONFIG,
  spacing: SPACING_CONFIG,
  error: ERROR_CONFIG,
  minimap: MINIMAP_CONFIG,
  background: BACKGROUND_CONFIG,
  viewport: VIEWPORT_CONFIG,
  zIndex: Z_INDEX,
} as const;

export type Config = typeof CONFIG;