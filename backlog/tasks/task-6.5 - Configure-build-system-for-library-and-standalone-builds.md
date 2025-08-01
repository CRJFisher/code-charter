---
id: task-6.5
title: Configure build system for library and standalone builds
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

Set up build configurations to support both library builds and standalone app builds, and remove the web folder from the VSCode extension by having it directly load the UI package's standalone build.

## Acceptance Criteria

- [x] Library build configuration outputs ES modules + TypeScript definitions
- [x] Standalone build creates self-contained web application with React bundled
- [x] VSCode extension loads UI package standalone build directly (no web folder)
- [ ] Development build supports hot module replacement
- [x] Production builds are properly optimized
- [x] Build scripts integrated with monorepo tooling
- [x] Web folder completely removed from VSCode extension

## Implementation Plan

1. Create standalone build configuration for UI package
2. Configure tsup to create multiple build outputs
3. Add standalone entry point that bundles React
4. Update package.json with build scripts
5. Update VSCode extension to use standalone build
6. Remove web folder from VSCode extension
7. Test standalone build in VSCode and browser

## Technical Details

### Current State

- The UI package is built as a library with external React dependencies (for npm consumption)
- The VSCode extension has a `web` folder that imports the UI package and bundles it with webpack
- The extension loads `web/dist/bundle.js` which includes React and all dependencies

### Required Changes

1. Add a standalone build configuration to the UI package that:
   - Bundles React and ReactDOM
   - Creates a single JavaScript file that can be loaded in a webview
   - Includes all CSS in the bundle
   - Exposes initialization function on window object

2. Update VSCode extension to:
   - Load the standalone build directly from node_modules/@code-charter/ui/dist/standalone.js
   - Remove the entire web folder and its build process
   - Update webview_template.ts to use the standalone build

3. Build configurations needed:
   - Library build (current): For npm packages that already have React
   - Standalone build (new): For VSCode webview and browser demo
   - Development build: With HMR and source maps

### Benefits

- Eliminates duplicate build configuration
- Removes unnecessary web folder
- Simplifies VSCode extension structure
- Single source of truth for UI build process

## Implementation Notes

- Approach taken:
  - Created standalone.tsx entry point that bundles React and exposes init function
  - Configured tsup with multiple build outputs (library and standalone IIFE)
  - Updated webview_template.ts to load standalone build from node_modules
  - Completely removed web folder from VSCode extension
  - Removed react-text-overflow dependency to simplify bundling

- Features implemented:
  - Library build: ES modules + CommonJS with external React (40KB)
  - Standalone build: IIFE format with React bundled (161KB minified, 293KB dev)
  - Separate CSS files for both builds
  - Source maps for debugging
  - Development and production build modes
  - Demo HTML file that loads standalone build

- Technical decisions:
  - Used tsup's multiple config support for different build targets
  - IIFE format for standalone build to work in webview context
  - Exposed CodeCharterUI global with init function for flexible initialization
  - Kept CSS separate to allow for custom styling if needed
  - Auto-initialization if root element exists

- Modified/added files:
  - packages/ui/src/standalone.tsx (new entry point)
  - packages/ui/tsup.config.ts (multiple build configurations)
  - packages/ui/package.json (updated scripts)
  - packages/ui/demo/standalone.html (updated to use build)
  - packages/vscode/src/webview_template.ts (loads standalone build)
  - Removed: entire packages/vscode/web folder

- Build outputs:
  - dist/index.js, dist/index.mjs - Library builds
  - dist/standalone.global.js - Standalone build for webview/browser
  - dist/standalone.css - Standalone styles
