# React Flow Configuration Guide

This document describes the configuration system for the React Flow visualization components.

## Overview

All configuration constants have been extracted into a central `config.ts` file to improve maintainability and make customization easier. The configuration is organized into logical sections for different aspects of the visualization.

## Configuration Structure

### Layout Configuration (`LAYOUT_CONFIG`)
- **ELK Layout Options**: Controls the hierarchical layout algorithm
  - `algorithm`: Layout algorithm to use (default: 'layered')
  - `spacing.nodeNode`: Space between nodes (default: 50)
  - `spacing.nodeNodeBetweenLayers`: Space between layers (default: 100)
  - `spacing.edgeNodeBetweenLayers`: Space between edges and nodes (default: 30)
- **Grid Layout**: Fallback layout when ELK fails
  - `spacingX`: Horizontal spacing (default: 300)
  - `spacingY`: Vertical spacing (default: 200)
- **Retry**: Layout calculation retry settings
  - `maxAttempts`: Maximum retry attempts (default: 2)
  - `delayMs`: Delay between retries (default: 500ms)

### Node Configuration (`NODE_CONFIG`)
- **Default Dimensions**: Default node size
  - `width`: Default width (default: 250)
  - `height`: Default height (default: 120)
- **Constraints**: Size limits
  - `minWidth`: Minimum width (default: 200)
  - `maxWidth`: Maximum width (default: 350)
- **Text Metrics**: Text calculation parameters
  - `basePadding`: Padding inside nodes (default: 20)
  - `charWidth`: Average character width (default: 8)
  - `lineHeight`: Line height (default: 20)
- **Visual Properties**: Node appearance
  - `borderWidth.default`: Normal border width (default: 2)
  - `borderWidth.selected`: Selected border width (default: 3)
  - `scale.hover`: Scale on hover (default: 1.05)

### Zoom Configuration (`ZOOM_CONFIG`)
- **Levels**: Zoom constraints
  - `min`: Minimum zoom level (default: 0.1)
  - `max`: Maximum zoom level (default: 2.5)
  - `threshold`: Threshold for zoom mode change (default: 0.45)
- **Culling**: Performance optimization
  - `threshold`: Zoom level for culling (default: 0.3)

### Animation Configuration (`ANIMATION_CONFIG`)
- **Duration**: Animation timings
  - `fitView`: Fit view animation (default: 500ms)
  - `panToNode`: Pan to node animation (default: 300ms)
  - `saveDelay`: Save operation delay (default: 100ms)
- **Debounce**: Debounce timings
  - `viewport`: Viewport change debounce (default: 100ms)
  - `save`: Save operation debounce (default: 1000ms)

### Performance Configuration (`PERFORMANCE_CONFIG`)
- **Node Thresholds**: Performance optimization triggers
  - `largeGraph`: Threshold for large graph optimizations (default: 200)
  - `showStats`: Show performance stats threshold (default: 100)
  - `hideIndicator`: Hide viewport indicators threshold (default: 50)
- **Virtual Rendering**: Virtual rendering settings
  - `renderBuffer`: Nodes to render outside viewport (default: 25)
  - `defaultBuffer`: Default buffer size (default: 50)

### Color Configuration (`COLOR_CONFIG`)
- **Node Colors**: Node appearance colors
  - `background.default`: Default node background
  - `background.module`: Module node background
  - `border.default`: Default border color
  - `border.selected`: Selected border color
  - `text.default`: Default text color
  - `text.entryPoint`: Entry point text color
- **Edge Colors**: Edge appearance
  - `stroke`: Edge color
  - `strokeWidth`: Edge width
- **UI Colors**: UI element colors
  - `button.primary`: Primary button color
  - `button.secondary`: Secondary button color
  - `button.danger`: Danger button color
  - `error.background`: Error background color
  - `error.border`: Error border color
  - `error.text`: Error text color

### Spacing Configuration (`SPACING_CONFIG`)
- **Padding**: Internal spacing
  - `small`: 4px
  - `medium`: 8px
  - `large`: 16px
  - `xlarge`: 20px
- **Margins**: External spacing
  - `small`: 4px
  - `medium`: 8px
  - `large`: 15px
  - `xlarge`: 20px
- **Border Radius**: Corner rounding
  - `small`: 3px
  - `medium`: 4px
  - `large`: 8px
- **Font Sizes**: Text sizes
  - `small`: 11px
  - `medium`: 12px
  - `large`: 16px
  - `xlarge`: 18px

### Error Configuration (`ERROR_CONFIG`)
- **Retry**: Error retry settings
  - `maxRetries`: Maximum retry attempts (default: 3)
  - `timeout`: Operation timeout (default: 30000ms)
- **Notifications**: Error notification settings
  - `maxNotifications`: Maximum visible notifications (default: 3)
  - `autoDismissDelay`: Auto-dismiss delay (default: 5000ms)
- **Error Log**: Error logging settings
  - `maxErrors`: Maximum stored errors (default: 100)

### Z-Index Configuration (`Z_INDEX`)
Defines layering order for UI elements:
- `background`: 0
- `nodes`: 1
- `edges`: 2
- `controls`: 5
- `overlay`: 10
- `notifications`: 1000

## Usage

Import the configuration in your component:

```typescript
import { CONFIG } from './config';

// Use specific configuration
const nodeWidth = CONFIG.node.default.width;
const primaryColor = CONFIG.color.ui.button.primary;

// Or import specific sections
import { NODE_CONFIG, COLOR_CONFIG } from './config';
```

## Customization

To customize the configuration, modify the values in `config.ts`. All components using the configuration will automatically use the new values.

Example customization:
```typescript
// Increase node spacing
LAYOUT_CONFIG.elk.spacing.nodeNode = 75;

// Change color scheme
COLOR_CONFIG.ui.button.primary = '#00a86b';

// Adjust performance thresholds
PERFORMANCE_CONFIG.nodes.largeGraph = 300;
```

## Type Safety

All configuration objects are defined with TypeScript `as const` assertions, providing full type safety and autocompletion. Type definitions are exported for each configuration section.

```typescript
import type { NodeConfig, ColorConfig } from './config';
```