---
id: task-6.5
title: Configure build system for library and standalone builds
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Set up build configurations to support both library builds and standalone app builds, and remove the web folder from the VSCode extension by having it directly load the UI package's standalone build.

## Acceptance Criteria

- [ ] Library build configuration outputs ES modules + TypeScript definitions
- [ ] Standalone build creates self-contained web application with React bundled
- [ ] VSCode extension loads UI package standalone build directly (no web folder)
- [ ] Development build supports hot module replacement
- [ ] Production builds are properly optimized
- [ ] Build scripts integrated with monorepo tooling
- [ ] Web folder completely removed from VSCode extension

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
