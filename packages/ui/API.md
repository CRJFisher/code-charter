# Code Charter UI API Documentation

The `@code-charter/ui` package provides a flexible, reusable UI component for visualizing code call graphs.

## Installation

```bash
npm install @code-charter/ui
```

## Quick Start

### Browser/Standalone Usage

```html
<!DOCTYPE html>
<html>
<head>
  <script src="node_modules/@code-charter/ui/dist/standalone.global.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    // Initialize with mock backend
    window.CodeCharterUI.init({
      rootElement: document.getElementById('root'),
      backend: {
        type: window.CodeCharterUI.BackendType.MOCK
      }
    });
  </script>
</body>
</html>
```

### React Application Usage

```typescript
import React from 'react';
import { CodeCharterUI, BackendProvider, MockBackend } from '@code-charter/ui';

function App() {
  const backend = new MockBackend();
  
  return (
    <BackendProvider backend={backend}>
      <CodeCharterUI />
    </BackendProvider>
  );
}
```

### VS Code Extension Usage

```typescript
import { init, BackendType } from '@code-charter/ui';

// In your webview
init({
  rootElement: document.getElementById('root'),
  backend: {
    type: BackendType.VSCODE
  }
});
```

## API Reference

### `init(config: InitConfig): void`

Initializes the Code Charter UI in standalone mode.

#### Parameters

- `config: InitConfig`
  - `rootElement: HTMLElement` - The DOM element to render into
  - `backend: Backend | BackendConfig` - Backend instance or configuration
  - `theme?: ThemeConfig` - Optional theme configuration

#### Example

```typescript
init({
  rootElement: document.getElementById('app'),
  backend: {
    type: BackendType.VSCODE
  },
  theme: {
    mode: 'dark'
  }
});
```

### Components

#### `<CodeCharterUI />`

The main UI component that renders the call graph visualization.

##### Props

No props - configuration is provided via context.

##### Usage

```tsx
import { CodeCharterUI, BackendProvider } from '@code-charter/ui';

<BackendProvider backend={backend}>
  <CodeCharterUI />
</BackendProvider>
```

#### `<BackendProvider>`

Context provider that supplies the backend to child components.

##### Props

- `backend: Backend` - The backend implementation to use
- `children: ReactNode` - Child components

### Backends

The UI package supports multiple backend implementations:

#### VSCodeBackend

Communicates with VS Code extension host via webview API.

```typescript
import { VSCodeBackend } from '@code-charter/ui';

const backend = new VSCodeBackend();
```

#### MockBackend

Provides mock data for testing and development.

```typescript
import { MockBackend } from '@code-charter/ui';

const backend = new MockBackend({
  callGraph: { /* your mock data */ },
  refinedSummaries: { /* your summaries */ }
});
```

#### Custom Backend

Implement the `Backend` interface to create custom backends:

```typescript
import { Backend } from '@code-charter/types';

class CustomBackend implements Backend {
  async getCallGraph(): Promise<CallGraph> {
    // Your implementation
  }
  
  async summariseCodeTree(symbol: string): Promise<TreeAndContextSummaries> {
    // Your implementation
  }
  
  async navigateToDoc(params: NavigateParams): Promise<NavigateResult> {
    // Your implementation
  }
  
  // ... other required methods
}
```

### Theme System

The UI automatically detects and adapts to the environment:

#### VS Code Theme Detection

When running in VS Code, the UI automatically uses VS Code's theme colors.

#### Standalone Themes

```typescript
import { init, ThemeMode } from '@code-charter/ui';

init({
  rootElement: element,
  backend: backend,
  theme: {
    mode: 'dark', // or 'light'
    colors: {
      // Optional custom colors
      'editor.background': '#1e1e1e',
      'editor.foreground': '#cccccc'
    }
  }
});
```

### Types

All TypeScript types are exported from `@code-charter/types`:

```typescript
import { 
  Backend,
  CallGraph,
  CallGraphNode,
  BackendConfig,
  ThemeConfig
} from '@code-charter/types';
```

## Advanced Usage

### Custom Backend with State Management

```typescript
class StatefulBackend implements Backend {
  private state = new Map<string, any>();
  
  async getCallGraph(): Promise<CallGraph> {
    // Check cache
    if (this.state.has('callGraph')) {
      return this.state.get('callGraph');
    }
    
    // Fetch and cache
    const graph = await fetchCallGraph();
    this.state.set('callGraph', graph);
    return graph;
  }
  
  // ... other methods
}
```

### Integration with Build Tools

#### Webpack

```javascript
module.exports = {
  resolve: {
    alias: {
      '@code-charter/ui': '@code-charter/ui/dist/index.esm.js'
    }
  }
};
```

#### Vite

```javascript
export default {
  optimizeDeps: {
    include: ['@code-charter/ui']
  }
};
```

### Server-Side Rendering

The UI package supports SSR with React:

```typescript
import { renderToString } from 'react-dom/server';
import { CodeCharterUI, BackendProvider, MockBackend } from '@code-charter/ui';

const html = renderToString(
  <BackendProvider backend={new MockBackend()}>
    <CodeCharterUI />
  </BackendProvider>
);
```

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- VS Code Webview: 1.60+

## Performance Considerations

1. **Large Graphs**: For graphs with >1000 nodes, consider implementing virtualization
2. **Caching**: Backends should implement caching for expensive operations
3. **Lazy Loading**: Load graph data progressively for better perceived performance

## Troubleshooting

### Common Issues

**UI not rendering**
- Ensure the root element exists in the DOM
- Check console for initialization errors
- Verify backend is properly configured

**Theme not applying**
- VS Code: Check that CSS variables are available
- Standalone: Ensure theme configuration is passed to init()

**Backend errors**
- Check network requests in DevTools
- Verify backend implementation returns correct data structure
- Enable debug logging: `window.DEBUG_CODE_CHARTER = true`

## Migration from Embedded Version

See the [Migration Guide](./MIGRATION.md) for detailed instructions on migrating from the embedded version to this package.