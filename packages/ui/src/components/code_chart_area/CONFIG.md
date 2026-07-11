# React Flow Configuration Guide

`chart_config.ts` holds every layout, sizing, timing, and layering constant used by the React Flow
visualization in one place. It exports a single frozen object, `CONFIG`, whose sections group related
values. Colors are not here; theme-derived colors live in `theme_config.ts`.

## Configuration Sections

### `CONFIG.layout`

Hierarchical layout inputs.

- `elk`: ELK layered-algorithm options — `algorithm`, `direction`, `edgeRouting`, `unnecessaryBendpoints`,
  `nodePlacement.strategy`, and `spacing.nodeNode` / `spacing.nodeNodeBetweenLayers` /
  `spacing.edgeNodeBetweenLayers`.
- `grid`: fallback grid spacing (`spacingX`, `spacingY`) used when ELK layout does not run.
- `retry`: layout retry policy (`max_attempts`, `delay_ms`).
- `module`: file-module group geometry. `innerPadding` is the gap between the module border and its child
  function nodes on the left, right, and bottom; the top gap is `innerPadding + headerHeight` to leave room
  for the title bar.

### `CONFIG.node`

- `default`: node size used to seed layout (`width`, `height`).
- `visual.borderWidth`: border thickness for `default` and `selected` states.
- `visual.scale.hover`: scale factor applied on hover.

### `CONFIG.zoom`

`levels` bounds the viewport zoom.

- `min` / `max`: allowed zoom range.
- `threshold`: at `transform[2] >= threshold` the view switches from the module-level overview to function
  detail.
- `initial_max_zoom`: caps the initial fit-to-view so the first frame lands in the module-level view. It
  stays strictly below `threshold`, otherwise small graphs open in function detail on load.

### `CONFIG.animation`

- `duration.fit_view` / `duration.panToNode`: animation durations in milliseconds.
- `debounce.viewport`: viewport-change debounce in milliseconds.

### `CONFIG.performance`

- `nodes.largeGraph` / `nodes.showStats` / `nodes.hideIndicator`: node-count thresholds that gate
  large-graph optimizations, performance stats, and viewport indicators.
- `virtualRender.render_buffer` / `virtualRender.defaultBuffer`: how many off-viewport nodes to keep
  rendered.

### `CONFIG.spacing`

Pixel scales for `padding`, `margin`, `borderRadius`, and `fontSize`, each keyed `small` / `medium` /
`large` (with `xlarge` on `padding`, `margin`, and `fontSize`).

### `CONFIG.error`

- `retry.max_retries`: maximum error retry attempts.
- `notifications.max_notifications`: maximum simultaneously visible notifications.

### `CONFIG.minimap`

- `nodeStrokeWidth`: minimap node outline width.

### `CONFIG.background`

- `gap` / `size`: React Flow background pattern spacing and dot size.

### `CONFIG.viewport`

- `fit_view.padding`: padding fraction applied when fitting the graph to view.
- `indicators.position.offset` and `indicators.position.transform.horizontal` / `.vertical`: viewport
  indicator placement.

### `CONFIG.zIndex`

Stacking order for overlaid UI: `controls`, `overlay`, `notifications`.

## Usage

```typescript
import { CONFIG } from "./chart_config";

const node_width = CONFIG.node.default.width;
const overlay_layer = CONFIG.zIndex.overlay;
```

## Type Safety

`CONFIG` is declared with an `as const` assertion, so every value is a literal type with full
autocompletion. Adjust the visualization by editing the values in `chart_config.ts`; every consumer reads
them through the `CONFIG` object.
