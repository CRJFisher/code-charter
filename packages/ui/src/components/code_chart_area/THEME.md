# React Flow Theme Support

The React Flow visualization renders against the active VSCode theme when hosted inside VSCode, and
against built-in light and dark themes in standalone mode. Colors are resolved from the current theme
every render, so switching themes restyles the whole graph.

## Theme System

### Detection

`ThemeProviderComponent` (`theme/theme_context.tsx`) picks a provider at mount: `VSCodeThemeProvider`
inside VSCode, `StandaloneThemeProvider` otherwise (or whenever `force_standalone` is set). Components
read the active theme through the `use_theme` hook.

- **VSCode mode**: the provider tracks VSCode's current theme and pushes changes through
  `on_theme_change`, so edits to the editor theme restyle the graph without a reload.
- **Standalone mode**: `use_theme` also exposes `set_theme` and `available_themes`; the selected theme
  name is persisted in `localStorage` under `code-charter-theme`.

### Color Resolution (`theme_config.ts`)

`get_theme_colors(theme)` returns a `ThemeColorConfig` for the current theme. Most surfaces come from a
fixed light or dark palette chosen by `theme.type`. A few surfaces are read directly from the VSCode
theme's `colors` map, falling back to the built-in palette when a key is absent:

- `editor.background` → panel background
- `editor.foreground` → default node and UI text
- `editorWidget.border` → UI border

`get_cluster_color(colors, index)` maps a cluster index onto the 12-entry cluster palette, wrapping so any
index (including negative) resolves to a color.

### Style Hook (`use_chart_theme_styles.ts`)

`use_flow_theme_styles` memoizes the resolved colors against the active theme and returns them alongside
style builders:

- `colors`: the full `ThemeColorConfig`.
- `get_node_style(selected, is_entry_point)`: node background, border, and text.
- `get_edge_style(selected)`: edge stroke and width, routed through `edge_style_for`.
- `get_button_style(variant)`: `primary` / `secondary` / `danger` button colors.
- `get_overlay_style()`: overlay and popup surfaces.
- `get_error_style()`: error message surfaces.

## Usage

```typescript
import { use_flow_theme_styles } from './use_chart_theme_styles';

const MyComponent = () => {
  const theme_styles = use_flow_theme_styles();

  return (
    <div style={theme_styles.get_node_style(selected, is_entry_point)}>
      {/* Component content */}
    </div>
  );
};
```

## Theme Colors

`ThemeColorConfig` groups colors by role:

- **node**: background (default, module, entry point), border (default, selected, module), and text
  (default, entry point, secondary, tertiary).
- **edge**: base and selected stroke.
- **cluster**: the 12-entry palette used to tint module groups.
- **ui**: panel/overlay/minimap backgrounds, button variants, status colors (error, warning, success,
  info), text, and loading indicator colors.
- **shadow** and **background**: depth effects and the background dot/grid color.

Node and button styles apply a `0.3s ease` transition so theme and selection changes animate.

## Adding Colors

To extend the palette, add the field to `ThemeColorConfig` and its light and dark values in
`get_theme_colors`, then read it through `use_flow_theme_styles`. To add a theme, define it in
`theme/default_themes.ts` following the VSCode theme color schema.
