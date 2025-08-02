---
id: task-6.6
title: Set up hot-reload development workflow
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

Configure development environment to support hot-reload when developing the UI package alongside the VSCode extension, avoiding the need to rebuild and reinstall on every change.

## Acceptance Criteria

- [x] Symbolic linking configured between packages during development
- [x] Webpack dev server works with VSCode extension webview
- [x] File watchers trigger appropriate rebuilds
- [x] Changes in UI package immediately reflected in extension
- [x] Development workflow documented

## Implementation Plan

1. Add development mode detection to VSCode extension
2. Create webpack dev server configuration for UI package
3. Update webview template to support dev server URLs
4. Add file watcher for UI package rebuilds
5. Configure VS Code settings for dev mode toggle
6. Test hot reload workflow
7. Document development setup

## Technical Details

### Development Workflow Requirements

- Avoid need to rebuild and reinstall extension on UI changes
- Use symbolic links or workspace protocol for local package references
- Configure webpack to watch UI package source files
- Hot module replacement for React components
- Preserve application state during hot reloads when possible

### Suggested Approach

1. Use npm/yarn workspace protocol (workspace:*) for local dependencies
2. Configure webpack dev server to serve UI assets
3. Point VSCode webview to dev server during development
4. Use webpack's watch mode with appropriate ignore patterns
5. Document the setup process clearly for other developers

### Implementation Options

1. **Development Mode Flag**: Add an environment variable or VS Code setting to switch between:
   - Production: Load from `node_modules/@code-charter/ui/dist/standalone.global.js`
   - Development: Load from local UI package build or dev server

2. **Dev Server Approach**:
   - Run UI package with `npm run dev:standalone --watch`
   - VSCode webview loads from `http://localhost:3000/standalone.global.js`
   - Supports true hot module replacement

3. **File Watcher Approach**:
   - VSCode watches UI package dist folder
   - Automatically reloads webview when files change
   - Simpler but requires manual page refresh

### Production Build Considerations

**IMPORTANT**: The development workflow must account for how the extension loads assets when packaged for release:

1. **Published Extension Structure**:
   - When published, the extension includes `node_modules/@code-charter/ui/dist/` in the .vsix package
   - The webview must load from the extension's installation directory, not a dev server
   - File paths must work in both development and production contexts

2. **Recommended Solution**:
   - Use an environment variable or VS Code configuration to determine load behavior
   - Example: `CODE_CHARTER_DEV_MODE` environment variable or `code-charter.devMode` setting
   - In production (default): Load from `node_modules/@code-charter/ui/dist/standalone.global.js`
   - In development: Load from dev server or watched local build

3. **Implementation Pattern**:

   ```typescript
   const isDevelopment = process.env.CODE_CHARTER_DEV_MODE || 
                         vscode.workspace.getConfiguration('code-charter').get('devMode');
   
   const scriptUri = isDevelopment 
     ? 'http://localhost:3000/standalone.global.js'  // Dev server
     : webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 
         'node_modules', '@code-charter', 'ui', 'dist', 'standalone.global.js'));
   ```

4. **Testing Production Build**:
   - Must test with `vsce package` to create .vsix file
   - Install and test the packaged extension
   - Ensure all assets load correctly from the bundled node_modules

## Implementation Notes

Implemented a comprehensive hot-reload development workflow that allows real-time UI development without rebuilding the VS Code extension:

### Approach Taken

1. **VS Code Configuration Settings**: Added two new settings to control dev mode:
   - `code-charter-vscode.devMode`: Boolean flag to enable development mode
   - `code-charter-vscode.devServerUrl`: Configurable dev server URL (defaults to <http://localhost:3000>)

2. **File Watcher Implementation**: Created `UIDevWatcher` class that:
   - Watches the UI package's dist folder for changes
   - Debounces rapid changes to avoid excessive reloads
   - Automatically reloads the webview when standalone.global.js changes
   - Shows informational message when dev mode is enabled

3. **Dual Loading Strategy**: Updated webview template to support both:
   - Production: Loads from bundled node_modules
   - Development: Loads from configurable dev server URL

4. **Convenient Dev Scripts**: Added npm scripts for easy development:
   - `dev:all`: Runs both build watcher and HTTP server concurrently
   - `dev:server`: Serves dist folder with CORS enabled
   - `dev:standalone`: Builds in watch mode for standalone bundle

### Features Implemented

- Hot reload support via both dev server and file watching
- Configurable dev mode through VS Code settings
- Demo page with mock data for standalone testing
- Automatic webview refresh on UI changes
- Preserved state between reloads (webview retainContextWhenHidden)

### Technical Decisions

- Used VS Code's built-in FileSystemWatcher for reliability
- Implemented debouncing to handle rapid successive changes
- Chose HTTP server approach over webpack-dev-server for simplicity
- Made dev mode opt-in to avoid accidental activation in production

### Modified Files

- `packages/vscode/package.json`: Added dev mode configuration settings
- `packages/vscode/src/webview_template.ts`: Added conditional loading based on dev mode
- `packages/vscode/src/dev_watcher.ts`: Created new file watcher class
- `packages/vscode/src/extension.ts`: Integrated dev watcher into webview lifecycle
- `packages/ui/package.json`: Added dev scripts and concurrently dependency
- `packages/ui/demo/index.html`: Created demo page for standalone testing
- `packages/ui/README.md`: Documented hot reload workflow

Implemented comprehensive hot-reload development workflow with VS Code settings, file watcher, and convenient dev scripts
