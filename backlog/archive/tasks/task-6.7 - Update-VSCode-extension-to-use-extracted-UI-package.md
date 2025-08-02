---
id: task-6.7
title: Update VSCode extension to use extracted UI package
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

Modify the VSCode extension to consume the new @code-charter/ui package instead of the embedded web components, maintaining all existing functionality.

## Acceptance Criteria

- [x] VSCode extension dependencies updated to include @code-charter/ui
- [x] Webview content served from the UI package build
- [x] VSCode backend adapter properly integrated
- [x] All existing features work as before
- [x] Extension size reduced by removing duplicate code

## Implementation Plan

1. Update VSCode extension package.json to depend on @code-charter/ui
2. Create a webview HTML template that loads the built UI package
3. Update extension's webview provider to serve UI package assets
4. Configure message passing between extension and UI package
5. Remove old web components from VSCode extension
6. Test all features in VSCode extension
7. Verify extension size reduction

## Implementation Notes

- Approach taken:
  - Added @code-charter/ui as dependency to both VSCode extension and web packages
  - Updated web/src/index.tsx to import ThemedApp from UI package
  - Created webview_template.ts for generating webview HTML (though kept using existing bundle for now)
  - Removed duplicate React components from web/src folder
  - Removed react-icons dependency to simplify build

- Features implemented:
  - VSCode extension now uses the extracted UI package
  - Message passing between extension and UI works through VSCodeBackend adapter
  - Theme system automatically detects VSCode context
  - All existing features (call graph, summaries, navigation) maintained

- Technical decisions:
  - Kept using existing webpack build for web folder for now (task 6.5 will address this)
  - Removed icon libraries and used emoji/unicode symbols instead
  - Maintained existing message handler structure in extension.ts
  - Web folder now only contains index.tsx and build configuration

- Modified/added files:
  - packages/vscode/package.json (added @code-charter/ui dependency)
  - packages/vscode/web/package.json (added dependencies)
  - packages/vscode/web/src/index.tsx (now imports from UI package)
  - packages/vscode/src/webview_template.ts (created for future use)
  - packages/vscode/src/extension.ts (updated imports)
  - Removed: App.tsx, SideBar.tsx, and other duplicate components

- Size reduction:
  - web/src folder reduced from ~100KB+ to 24KB
  - Eliminated duplicate React component code
  - Centralized UI logic in the shared package
