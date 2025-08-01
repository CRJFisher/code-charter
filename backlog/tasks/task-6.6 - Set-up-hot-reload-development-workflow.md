---
id: task-6.6
title: Set up hot-reload development workflow
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Configure development environment to support hot-reload when developing the UI package alongside the VSCode extension, avoiding the need to rebuild and reinstall on every change.

## Acceptance Criteria

- [ ] Symbolic linking configured between packages during development
- [ ] Webpack dev server works with VSCode extension webview
- [ ] File watchers trigger appropriate rebuilds
- [ ] Changes in UI package immediately reflected in extension
- [ ] Development workflow documented

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
