# React Flow Theme Support

This document describes the theme support implementation for React Flow components in Code Charter.

## Overview

The React Flow visualization now fully supports VSCode themes when running inside VSCode, and provides built-in light/dark themes for standalone mode. All colors are dynamically adjusted based on the current theme.

## Architecture

### Theme Detection
- **VSCode Mode**: Automatically detects and uses the current VSCode theme
- **Standalone Mode**: Provides light and dark theme options with a theme switcher

### Theme System Components

1. **Theme Configuration (`theme_config.ts`)**
   - Maps VSCode theme colors to React Flow component colors
   - Provides separate configurations for light and dark themes
   - Generates theme-aware color configurations

2. **Flow Theme Provider (`flow_theme_provider.tsx`)**
   - React context provider for theme colors
   - Applies CSS variables for theme colors
   - Manages theme transitions

3. **Theme Styles Hook (`use_flow_theme_styles.ts`)**
   - Provides theme-aware styles to components
   - Offers utility functions for common style patterns
   - Ensures consistent theming across all components

4. **Theme CSS (`flow_theme.css`)**
   - Global CSS for smooth theme transitions
   - Theme-specific styles for React Flow controls
   - Handles built-in React Flow component theming

## Usage

### In Components

```typescript
import { useFlowThemeStyles } from './use_flow_theme_styles';

const MyComponent = () => {
  const themeStyles = useFlowThemeStyles();
  
  return (
    <div style={themeStyles.getNodeStyle(selected, isEntryPoint)}>
      {/* Component content */}
    </div>
  );
};
```

### Available Style Functions

- `getNodeStyle(selected, isEntryPoint)`: Node styling
- `getEdgeStyle(selected)`: Edge styling
- `getButtonStyle(variant)`: Button styling (primary/secondary/danger)
- `getPanelStyle()`: Panel/container styling
- `getOverlayStyle()`: Overlay/popup styling
- `getErrorStyle()`: Error message styling
- `getTextStyle(variant)`: Text styling (primary/secondary)

## Theme Colors

### Node Colors
- **Background**: Different for default, module, and entry point nodes
- **Border**: Changes based on selection state and node type
- **Text**: Primary, secondary, and tertiary text colors

### Edge Colors
- **Default**: Subtle color for unselected edges
- **Selected**: Highlighted color for selected edges

### UI Colors
- **Backgrounds**: Panel, overlay, and minimap backgrounds
- **Buttons**: Primary, secondary, danger, and disabled states
- **Status**: Error, warning, success, and info colors
- **Shadows**: Depth effects that adapt to theme

## VSCode Integration

When running in VSCode:
- Theme colors are automatically extracted from VSCode's current theme
- All color changes in VSCode are reflected in real-time
- No manual theme switching is needed

## Standalone Mode

When running outside VSCode:
- Light and dark themes are available
- Theme preference is persisted in localStorage
- Smooth transitions between themes
- Optional theme switcher component

## Theme Transitions

All theme changes include smooth CSS transitions for:
- Background colors
- Border colors
- Text colors
- Fill colors
- Stroke colors

Transition duration: 0.3s with ease timing function

## Accessibility

- All themes maintain WCAG AA contrast ratios
- Entry point nodes have distinct visual treatment
- Selected states are clearly visible in both themes
- Error states use appropriate color contrasts

## Customization

To add new theme colors:

1. Update `theme_config.ts` to map new colors
2. Add CSS variables in `getThemeCssVariables`
3. Use colors via `useFlowThemeStyles` hook

To create custom themes:

1. Define theme in `default_themes.ts`
2. Follow the VSCode theme color schema
3. Test contrast ratios for accessibility

## Testing

Theme support includes:
- Automatic theme detection tests
- Color contrast validation
- Theme switching functionality
- CSS variable application
- Component styling consistency