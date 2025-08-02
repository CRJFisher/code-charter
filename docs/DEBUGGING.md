# Debugging Code Charter

This guide explains how to debug both the VS Code extension and UI package with breakpoints in VS Code.

## Prerequisites

- VS Code installed
- Node.js and npm installed
- All dependencies installed (`npm install` in root directory)
- Initial build completed (`npm run build` in root directory)

## Two Ways to Debug UI Code

### Method 1: Debug UI in Node.js (Full VS Code Debugging)

This method runs UI components in a Node.js environment, allowing you to set breakpoints in VS Code:

1. **Use "Debug UI in Node + Extension" compound configuration**
   - This starts three processes:
     - UI debug server (Node.js with debugging)
     - UI dev server (for the webview)
     - VS Code extension (with debugging)

2. **Set breakpoints in UI code**
   - Open any `.tsx` file in `packages/ui/src/`
   - Click in the gutter to set breakpoints
   - Breakpoints will hit when the debug entry point runs your components

3. **Debug entry point**
   - The debug configuration uses `src/debug-entry.tsx`
   - This file runs your UI components in Node.js
   - Modify this file to test different components/scenarios

### Method 2: Standard Webview Debugging

For debugging UI in its actual webview environment:

1. **Use "Debug Both (Separate Terminals)" configuration**
   - Starts UI dev server (without Node debugging)
   - Starts VS Code extension with debugging

2. **Debug using Chrome DevTools**
   - Right-click in webview → Inspect
   - Use Sources tab for breakpoints
   - Console for logs

## Complete Debugging Workflows

### Workflow A: Full Debugging with Breakpoints in Both Packages

1. **Select "Debug UI in Node + Extension"** from debug dropdown
2. **Press F5**
3. **Three terminals will open:**
   - Terminal 1: UI debug server (Node.js)
   - Terminal 2: UI dev server (http://localhost:3000)
   - Terminal 3: VS Code extension host
4. **Set breakpoints:**
   - Extension code: Any `.ts` file in `packages/vscode/src/`
   - UI code: Any `.tsx` file in `packages/ui/src/`
5. **In the debug VS Code window:**
   - Run "Code Charter: Generate Diagram"
   - Extension breakpoints hit immediately
   - UI breakpoints hit when components render

### Workflow B: Production-Like Debugging

1. **Select "Debug Both (Separate Terminals)"**
2. **Press F5**
3. **Debug extension with breakpoints**
4. **Debug UI with Chrome DevTools**

## How It Works

### UI Node.js Debugging

The UI debug configuration:
- Runs `tsx --inspect` to execute TypeScript directly
- Uses `debug-entry.tsx` to render components in Node
- Allows VS Code debugger to attach
- Supports hot reload with `tsx watch`

### Extension Debugging

The extension debug configuration:
- Launches new VS Code instance
- Automatically enables dev mode
- Loads UI from dev server

## Setting Up Your Debug Entry Point

Edit `packages/ui/src/debug-entry.tsx` to test specific scenarios:

```typescript
// Test a specific component
import { YourComponent } from './components/your_component';

// Add test data
const testProps = {
  // your props here
};

// Render and debug
const html = renderToString(<YourComponent {...testProps} />);
```

## Tips

1. **UI debugging in Node.js**:
   - Great for testing component logic
   - Can't test browser-specific features (DOM events, etc.)
   - Use for algorithmic debugging

2. **Webview debugging**:
   - Tests actual runtime environment
   - Use for UI interaction debugging
   - Chrome DevTools provides full debugging

3. **Hot reload**:
   - Both methods support hot reload
   - Changes appear instantly

4. **Console output**:
   - Node debugging: Output in VS Code terminal
   - Webview: Output in Chrome DevTools console

## Troubleshooting

### "Extension host did not start in 10 seconds"
Normal - the debugger is attaching. Wait a moment.

### UI breakpoints not hitting
1. Ensure you're using "Debug UI in Node + Extension"
2. Check that `debug-entry.tsx` imports your component
3. Verify breakpoint is in code that executes

### Port 3000 already in use
```bash
lsof -ti:3000 | xargs kill -9
```

### TSX not found
Run `npm install` in the packages/ui directory to install tsx.

## Example Debug Session

1. Open `packages/ui/src/components/code_charter_ui.tsx`
2. Set breakpoint in the `CodeCharterUI` component
3. Run "Debug UI in Node + Extension" (F5)
4. Watch breakpoint hit in the Node debug terminal
5. Open debug VS Code window
6. Run "Code Charter: Generate Diagram"
7. See UI render with your debugging insights!

This setup provides full debugging capabilities for both the extension and UI code with breakpoints directly in VS Code.