# Code Charter UI Package

A reusable UI package for the Code Charter visualization tool that works in multiple contexts including VS Code webviews and standalone web applications.

## Installation

```bash
npm install @code-charter/ui
```

## Documentation

- [API Documentation](./API.md) - Complete API reference and usage examples
- [Migration Guide](./MIGRATION.md) - Migrate from embedded to package-based UI
- [Development Guide](../../docs/DEVELOPMENT.md) - Development setup and workflows

## Quick Start

### VS Code Extension

```typescript
import { getWebviewContent } from './webview_template';

const panel = vscode.window.createWebviewPanel(...);
panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
```

### Standalone Web App

```html
<script src="node_modules/@code-charter/ui/dist/standalone.global.js"></script>
<script>
  window.CodeCharterUI.init({
    rootElement: document.getElementById('root'),
    backend: { type: window.CodeCharterUI.BackendType.MOCK }
  });
</script>
```

### React Application

```tsx
import { CodeCharterUI, BackendProvider, MockBackend } from '@code-charter/ui';

function App() {
  return (
    <BackendProvider backend={new MockBackend()}>
      <CodeCharterUI />
    </BackendProvider>
  );
}
```

## Development

### Hot Reload Workflow

For a fast development workflow with hot reload:

1. **Start the UI dev server:**
   ```bash
   cd packages/ui
   npm run dev:all
   ```
   This runs both the build watcher and HTTP server on http://localhost:3000

2. **Enable dev mode in VS Code:**
   - Open VS Code settings (Cmd+,)
   - Search for "Code Charter"
   - Enable "Dev Mode" checkbox
   - Optionally adjust "Dev Server URL" if using a different port

3. **Open the webview:**
   - Run the "Code Charter: Generate Diagram" command
   - The webview will now load the UI from your dev server
   - Changes to UI code will automatically rebuild and reload the webview

### Testing the Standalone Build

Open `packages/ui/demo/index.html` in a browser to test the standalone build with mock data.

### Build Commands

- `npm run build` - Build both library and standalone versions
- `npm run dev` - Watch mode for library build
- `npm run dev:standalone` - Watch mode for standalone build
- `npm run dev:server` - Run HTTP server for development
- `npm run dev:all` - Run both watcher and server (recommended for development)

## Architecture

The UI package supports multiple backend contexts through the backend abstraction layer:

- **VSCode Backend**: Communicates with VS Code extension via webview API
- **Mock Backend**: For development and testing with mock data
- **Standalone Backend**: For running as a standalone web application

The package provides two build outputs:

1. **Library build** (`dist/index.js`): For npm packages, with React as external dependency
2. **Standalone build** (`dist/standalone.global.js`): IIFE bundle with React included for direct browser usage