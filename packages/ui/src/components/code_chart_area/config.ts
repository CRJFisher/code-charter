// Configuration constants for React Flow code visualization
// Note: Color values in this file are defaults. Actual colors are theme-aware
// and are provided by the theme system based on the current VSCode theme.

// Layout Configuration
export const LAYOUT_CONFIG = {
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
    maxAttempts: 2,
    delayMs: 500,
  },
} as const;

// Node Configuration
export const NODE_CONFIG = {
  // Default Dimensions
  default: {
    width: 250,
    height: 120,
  },
  // Size Constraints
  constraints: {
    minWidth: 200,
    maxWidth: 350,
  },
  // Text Metrics
  text: {
    basePadding: 20,
    charWidth: 8,
    lineHeight: 20,
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
export const ZOOM_CONFIG = {
  // Zoom Levels
  levels: {
    min: 0.1,
    max: 2.5,
    threshold: 0.45,
  },
  // Culling
  culling: {
    threshold: 0.3,
  },
} as const;

// Animation Configuration
export const ANIMATION_CONFIG = {
  // Durations (in ms)
  duration: {
    fitView: 500,
    panToNode: 300,
    saveDelay: 100,
  },
  // Debounce/Throttle
  debounce: {
    viewport: 100,
    save: 1000,
  },
} as const;

// Performance Configuration
export const PERFORMANCE_CONFIG = {
  // Node Count Thresholds
  nodes: {
    largeGraph: 200,
    showStats: 100,
    hideIndicator: 50,
  },
  // Virtual Rendering
  virtualRender: {
    renderBuffer: 25,
    defaultBuffer: 50,
  },
} as const;


// UI Spacing Configuration
export const SPACING_CONFIG = {
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
export const ERROR_CONFIG = {
  // Retry
  retry: {
    maxRetries: 3,
    timeout: 30000,
  },
  // Notifications
  notifications: {
    maxNotifications: 3,
    autoDismissDelay: 5000,
  },
  // Error Log
  errorLog: {
    maxErrors: 100,
  },
} as const;

// MiniMap Configuration
export const MINIMAP_CONFIG = {
  nodeStrokeWidth: 3,
  colors: {
    moduleGroup: '#e0e0e0',
    entryPoint: '#4caf50',
    selected: '#0096FF',
    default: '#ff0072',
  },
} as const;

// Background Configuration
export const BACKGROUND_CONFIG = {
  variant: 'dots' as const,
  gap: 12,
  size: 1,
} as const;

// Viewport Configuration
export const VIEWPORT_CONFIG = {
  fitView: {
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
export const Z_INDEX = {
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

// Type definitions for configuration
export type LayoutConfig = typeof LAYOUT_CONFIG;
export type NodeConfig = typeof NODE_CONFIG;
export type ZoomConfig = typeof ZOOM_CONFIG;
export type AnimationConfig = typeof ANIMATION_CONFIG;
export type PerformanceConfig = typeof PERFORMANCE_CONFIG;
export type SpacingConfig = typeof SPACING_CONFIG;
export type ErrorConfig = typeof ERROR_CONFIG;
export type MinimapConfig = typeof MINIMAP_CONFIG;
export type BackgroundConfig = typeof BACKGROUND_CONFIG;
export type ViewportConfig = typeof VIEWPORT_CONFIG;
export type ZIndexConfig = typeof Z_INDEX;
export type Config = typeof CONFIG;