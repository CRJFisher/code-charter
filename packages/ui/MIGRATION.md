# Migration Guide: From Embedded to Package-based UI

This guide helps you migrate from the embedded Code Charter UI to the `@code-charter/ui` package.

## Overview

The main changes:
1. UI code now lives in a separate npm package
2. Backend communication is abstracted through interfaces
3. Build configuration is simplified
4. Theme system is more flexible

## Migration Steps

### 1. Install the Package

```bash
npm install @code-charter/ui
```

### 2. Remove Old Web Directory

Delete the entire `web/` directory from your VS Code extension:

```bash
rm -rf packages/vscode/web
```

### 3. Update Extension Code

#### Before (Embedded)

```typescript
// extension.ts
import { getWebviewContent } from './web/webview';

const panel = vscode.window.createWebviewPanel(...);
panel.webview.html = getWebviewContent(panel.webview, context);

// Handle messages directly
panel.webview.onDidReceiveMessage(async (message) => {
  switch (message.command) {
    case 'getCallGraph':
      const graph = await getCallGraph();
      panel.webview.postMessage({ 
        command: 'callGraphData', 
        data: graph 
      });
      break;
  }
});
```

#### After (Package-based)

```typescript
// extension.ts
import { getWebviewContent } from './webview_template';

const panel = vscode.window.createWebviewPanel(...);
panel.webview.html = getWebviewContent(
  panel.webview,
  context.extensionUri,
  colorCustomizations
);

// Same message handling - the UI package handles the protocol
panel.webview.onDidReceiveMessage(async (message) => {
  const { command, id, ...otherFields } = message;
  
  switch (command) {
    case 'getCallGraph':
      const graph = await getCallGraph();
      panel.webview.postMessage({ 
        id,
        command: 'getCallGraphResponse', 
        data: graph 
      });
      break;
  }
});
```

### 4. Create Webview Template

Create `webview_template.ts`:

```typescript
import * as vscode from 'vscode';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  colorCustomizations: any
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@code-charter', 'ui', 'dist', 'standalone.global.js')
  );
  
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@code-charter', 'ui', 'dist', 'standalone.css')
  );

  const nonce = getNonce();

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Code Charter</title>
    </head>
    <body>
      <div id="root"></div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
      <script nonce="${nonce}">
        window.CodeCharterUI.init({
          rootElement: document.getElementById('root'),
          backend: {
            type: window.CodeCharterUI.BackendType.VSCODE
          }
        });
      </script>
    </body>
    </html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

### 5. Update Package.json

Remove web-related build scripts and dependencies:

#### Before

```json
{
  "scripts": {
    "build-web": "webpack --config ./web/webpack.config.js",
    "watch-web": "webpack --watch --config ./web/webpack.config.js"
  },
  "devDependencies": {
    "webpack": "^5.0.0",
    "webpack-cli": "^4.0.0",
    "ts-loader": "^9.0.0",
    "css-loader": "^6.0.0",
    "style-loader": "^3.0.0"
  }
}
```

#### After

```json
{
  "dependencies": {
    "@code-charter/ui": "^0.0.1"
  }
}
```

### 6. Update Build Process

#### Before

```json
{
  "scripts": {
    "vscode:prepublish": "npm run build && npm run build-web"
  }
}
```

#### After

```json
{
  "scripts": {
    "vscode:prepublish": "npm run build"
  }
}
```

The UI is now pre-built in the npm package!

### 7. Testing the Migration

1. **Build and run**:
   ```bash
   npm install
   npm run build
   # Press F5 to debug
   ```

2. **Verify functionality**:
   - Open command palette: "Code Charter: Generate Diagram"
   - Check that the UI loads correctly
   - Verify theme integration works
   - Test all interactions (node clicks, summaries, etc.)

## Common Issues and Solutions

### Issue: Webview shows blank screen

**Solution**: Check the browser console for errors:
- Right-click webview → "Inspect Element"
- Look for 404 errors or script errors
- Verify paths in `webview_template.ts`

### Issue: Theme colors not applying

**Solution**: Ensure you're passing color customizations:
```typescript
const colorCustomizations = vscode.workspace
  .getConfiguration()
  .get("workbench.colorCustomizations") || {};
```

### Issue: Messages not working

**Solution**: The message protocol changed slightly:
- Requests now include an `id` field
- Responses must include the same `id`
- Response commands end with "Response" (e.g., `getCallGraphResponse`)

### Issue: Build errors

**Solution**: Clean and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Benefits After Migration

1. **Simpler build process** - No webpack configuration needed
2. **Faster development** - Hot reload support
3. **Better testing** - UI can be tested in isolation
4. **Reusability** - UI can be used in other contexts
5. **Smaller extension size** - Shared dependencies
6. **Easier maintenance** - Clear separation of concerns

## Advanced Migration Scenarios

### Custom UI Modifications

If you had custom modifications to the UI:

1. **Fork the UI package** and apply your changes
2. **Extend components** using composition:
   ```typescript
   import { CodeCharterUI } from '@code-charter/ui';
   
   function CustomUI() {
     return (
       <div className="custom-wrapper">
         <CodeCharterUI />
         <CustomPanel />
       </div>
     );
   }
   ```

3. **Use custom backends** for additional functionality:
   ```typescript
   class ExtendedBackend extends VSCodeBackend {
     async customMethod() {
       // Your custom logic
     }
   }
   ```

### Gradual Migration

For large codebases, migrate gradually:

1. Install the package alongside existing code
2. Use feature flags to switch between old and new
3. Migrate one component at a time
4. Remove old code once fully migrated

## Need Help?

- Check the [API Documentation](./API.md)
- Review the [example implementation](../vscode/)
- File issues on GitHub
- Join our community chat

## Rollback Plan

If you need to rollback:

1. Restore the `web/` directory from git
2. Revert package.json changes
3. Restore old build scripts
4. Rebuild and test

Keep a git tag before migration for easy rollback:
```bash
git tag pre-ui-migration
```