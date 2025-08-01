---
id: task-6.4
title: Implement flexible theme system for multiple contexts
status: Done
assignee:
  - '@claude'
created_date: '2025-08-01'
updated_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Create a theme system that works with VSCode CSS variables in webview context and provides default/custom themes for standalone deployment.

## Acceptance Criteria

- [x] Theme provider interface supporting multiple theme sources
- [x] VSCode theme adapter using CSS variables
- [x] Default light and dark themes for standalone usage
- [x] Theme switching functionality in standalone mode
- [x] All components properly styled in all contexts


## Implementation Plan

1. Create theme provider interface and types
2. Implement VSCode theme provider that reads CSS variables
3. Create default light and dark themes for standalone
4. Implement theme context and React hooks
5. Add theme switching UI for standalone mode
6. Update all components to use theme system
7. Test in both VSCode and standalone contexts
## Technical Details

### Current Theme Implementation

- Uses VSCode CSS variables (--vscode-editor-*) throughout
- Tailwind config references these variables for consistency
- colorTheme.ts reads CSS variables at runtime

### Required Abstraction

- Theme provider that can switch between:
  - VSCode CSS variables when in webview
  - Custom theme implementation for standalone
  - User-configurable themes
- Maintain the same theme keys for consistency
- Support dynamic theme switching in standalone mode

## Implementation Notes

- Approach taken:
  - Created ThemeProvider interface with support for VSCode and standalone contexts
  - Implemented VSCodeThemeProvider that reads CSS variables from the DOM
  - Created StandaloneThemeProvider with localStorage persistence and system preference detection
  - Added React context and hooks for theme management
  - Built theme switcher UI component for standalone mode

- Features implemented:
  - Theme type definitions matching VSCode's theme structure
  - Automatic theme detection (VSCode vs standalone)
  - CSS variable mapping for consistent styling
  - Light/dark theme toggle with emoji icons
  - System preference detection for initial theme
  - Theme persistence in localStorage
  - MutationObserver for VSCode theme change detection

- Technical decisions:
  - Used CSS variables for all theme colors to maintain consistency
  - Created separate providers for VSCode and standalone contexts
  - Used React context for theme state management
  - Removed react-icons dependency to avoid build issues
  - Applied themes by setting CSS variables on document root

- Modified/added files:
  - packages/types/src/theme.ts (theme type definitions)
  - packages/ui/src/theme/default_themes.ts (light and dark themes)
  - packages/ui/src/theme/vscode_theme_provider.ts (VSCode integration)
  - packages/ui/src/theme/standalone_theme_provider.ts (standalone mode)
  - packages/ui/src/theme/theme_context.tsx (React context and hooks)
  - packages/ui/src/theme/theme_switcher.tsx (UI components)
  - packages/ui/src/components/themed_app.tsx (app wrapper with theme)
  - packages/ui/demo/ (demo files for testing)
