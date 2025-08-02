# Code Charter UI Package

A reusable UI package for the Code Charter visualization tool that works in multiple contexts including VS Code webviews and standalone web applications.

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