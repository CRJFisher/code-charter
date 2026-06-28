const LAYOUT_CONFIG = {
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
  grid: {
    spacingX: 300,
    spacingY: 200,
  },
  retry: {
    max_attempts: 2,
    delay_ms: 500,
  },
  // innerPadding is the gap between the module border and its child function
  // nodes on left/right/bottom. The top gap is innerPadding + headerHeight to
  // leave room for the title bar.
  module: {
    innerPadding: 40,
    headerHeight: 30,
  },
} as const;

const NODE_CONFIG = {
  default: {
    width: 250,
    height: 120,
  },
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

const ZOOM_CONFIG = {
  levels: {
    min: 0.1,
    max: 2.5,
    threshold: 0.45,
    // Cap for the initial fit-to-view so the first frame lands in the module-level
    // view (modules render as boxes, functions are simplified). Must stay strictly
    // below `threshold`: the view switches to function detail at `transform[2] >= threshold`.
    initial_max_zoom: 0.44,
  },
} as const;

const ANIMATION_CONFIG = {
  duration: {
    fit_view: 500,
    panToNode: 300,
  },
  debounce: {
    viewport: 100,
  },
} as const;

const PERFORMANCE_CONFIG = {
  nodes: {
    largeGraph: 200,
    showStats: 100,
    hideIndicator: 50,
  },
  virtualRender: {
    render_buffer: 25,
    defaultBuffer: 50,
  },
} as const;

const SPACING_CONFIG = {
  padding: {
    small: 4,
    medium: 8,
    large: 16,
    xlarge: 20,
  },
  margin: {
    small: 4,
    medium: 8,
    large: 15,
    xlarge: 20,
  },
  borderRadius: {
    small: 3,
    medium: 4,
    large: 8,
  },
  fontSize: {
    small: 11,
    medium: 12,
    large: 16,
    xlarge: 18,
  },
} as const;

const ERROR_CONFIG = {
  retry: {
    max_retries: 3,
  },
  notifications: {
    max_notifications: 3,
  },
} as const;

const MINIMAP_CONFIG = {
  nodeStrokeWidth: 3,
} as const;

const BACKGROUND_CONFIG = {
  gap: 12,
  size: 1,
} as const;

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

const Z_INDEX = {
  controls: 5,
  overlay: 10,
  notifications: 1000,
} as const;

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
