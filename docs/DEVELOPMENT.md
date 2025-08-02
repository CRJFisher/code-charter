# Code Charter Development Guide

This guide provides comprehensive information for developing Code Charter, including setup, architecture, workflows, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Setup](#development-setup)
3. [Development Workflows](#development-workflows)
4. [Debugging](#debugging)
5. [Testing](#testing)
6. [Building and Releasing](#building-and-releasing)
7. [Contributing](#contributing)

## Architecture Overview

Code Charter is organized as a monorepo with three main packages:

```
code-charter/
├── packages/
│   ├── vscode/          # VS Code extension
│   ├── ui/              # Reusable UI components (React)
│   └── types/           # Shared TypeScript types
├── docs/                # Documentation
└── backlog/             # Task management
```

### Package Dependencies

```mermaid
graph TD
    vscode[packages/vscode] --> ui[packages/ui]
    vscode --> types[packages/types]
    ui --> types
```

### Key Design Decisions

1. **UI Package Independence**: The UI package can run in multiple contexts (VS Code webview, standalone browser)
2. **Backend Abstraction**: UI communicates through abstract backend interfaces, not direct VS Code APIs
3. **Theme Flexibility**: Automatic detection and adaptation to VS Code themes or standalone themes
4. **Hot Reload Development**: Fast iteration with automatic rebuilds and reloads

## Development Setup

### Prerequisites

- Node.js 18+ and npm 9+
- VS Code (latest stable version)
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/code-charter.git
   cd code-charter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build all packages**
   ```bash
   npm run build
   ```

4. **Verify setup**
   ```bash
   npm run typecheck
   npm run lint
   ```

## Development Workflows

### Daily Development Flow

1. **Start the UI dev server**
   ```bash
   cd packages/ui
   npm run dev:all
   ```
   This runs the build watcher and HTTP server concurrently.

2. **Start debugging**
   - Open VS Code at the repository root
   - Press `F5` (uses default debug configuration)
   - A new VS Code window opens with the extension loaded

3. **Make changes**
   - UI changes: Automatically rebuild and reload
   - Extension changes: Restart debug session (`Shift+F5`, then `F5`)

### Working on Specific Packages

#### UI Package Development

```bash
cd packages/ui
npm run dev:all          # Start dev server with hot reload
npm run build            # Build for production
npm run typecheck        # Check TypeScript types
npm run lint             # Run ESLint
```

**Testing UI in isolation:**
- Open http://localhost:3000/demo/index.html
- Uses mock data for rapid iteration
- Full browser DevTools available

#### VS Code Extension Development

```bash
cd packages/vscode
npm run build            # Compile TypeScript
npm run watch            # Watch mode for development
npm run package          # Create .vsix file
```

#### Types Package

```bash
cd packages/types
npm run build            # Compile TypeScript definitions
npm run typecheck        # Verify types
```

### Hot Reload Workflow

The hot reload setup allows you to see UI changes instantly:

1. **Enable Dev Mode** (automatic when debugging)
2. **Make UI changes** → Save file
3. **See changes** in webview immediately

No manual refresh needed!

## Debugging

### Quick Start

**Debug everything with breakpoints:**
1. Select **"Debug UI in Node + Extension"** from debug dropdown
2. Press `F5`
3. Set breakpoints in both packages
4. Debug with full VS Code integration

### Debug Configurations

#### 1. Debug VS Code Extension Only
- Full debugging support for extension code
- Set breakpoints in `packages/vscode/src/**/*.ts`
- Step through extension initialization, commands, etc.

#### 2. Debug UI in Node + Extension
- Runs UI components in Node.js for debugging
- Set breakpoints in both packages
- Three processes run simultaneously:
  - UI debug server (Node.js)
  - UI dev server (webview)
  - VS Code extension

#### 3. Debug Both (Separate Terminals)
- Production-like setup
- Extension debugging with breakpoints
- UI debugging via Chrome DevTools

### Setting Breakpoints

**Extension code:**
```typescript
// packages/vscode/src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Set breakpoint here
  const disposable = vscode.commands.registerCommand(...);
}
```

**UI code:**
```typescript
// packages/ui/src/components/code_charter_ui.tsx
export function CodeCharterUI() {
  // Set breakpoint here
  const [state, setState] = useState();
}
```

### UI Debug Entry Point

Customize `packages/ui/src/debug-entry.tsx` to test specific scenarios:

```typescript
// Test specific component states
const testProps = {
  initialData: mockData,
  onError: (e) => console.error(e)
};

// Debug render
const html = renderToString(<YourComponent {...testProps} />);
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific package
cd packages/ui && npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Writing Tests

**UI Component Test:**
```typescript
// packages/ui/src/components/__tests__/code_charter_ui.test.tsx
import { render, screen } from '@testing-library/react';
import { CodeCharterUI } from '../code_charter_ui';

test('renders without crashing', () => {
  render(<CodeCharterUI />);
  expect(screen.getByRole('main')).toBeInTheDocument();
});
```

**Extension Test:**
```typescript
// packages/vscode/src/test/extension.test.ts
import * as vscode from 'vscode';
import { activate } from '../extension';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('your-publisher.code-charter'));
  });
});
```

## Building and Releasing

### Local Builds

```bash
# Build everything
npm run build

# Build specific package
cd packages/ui && npm run build
```

### Creating a VS Code Extension Package

```bash
cd packages/vscode
npm run package
# Creates: code-charter-x.x.x.vsix
```

### Pre-release Checklist

1. **Update versions**
   ```bash
   npm run version
   ```

2. **Run all checks**
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

3. **Test the packaged extension**
   - Install the .vsix file
   - Test all features
   - Verify in different VS Code versions

### Publishing

```bash
# Publish to VS Code Marketplace
cd packages/vscode
vsce publish

# Publish to npm (UI package)
cd packages/ui
npm publish
```

## Contributing

### Code Style

- TypeScript with strict mode
- Snake_case for variables/functions (except classes: PascalCase)
- ESLint and Prettier for formatting
- Comprehensive JSDoc comments

### Commit Messages

Follow conventional commits:
```
feat(ui): add new visualization mode
fix(vscode): resolve webview loading issue
docs: update debugging guide
chore: upgrade dependencies
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes following coding standards
3. Add/update tests
4. Update documentation
5. Submit PR with clear description

### Task Management

We use Backlog.md for task tracking:

```bash
# View current tasks
backlog task list --plain

# Start work on a task
backlog task edit <id> -s "In Progress"

# Complete a task
backlog task edit <id> -s "Done" --notes "Implementation details..."
```

## Troubleshooting

### Common Issues

**Extension host timeout:**
- Normal during debugging - wait for attachment

**Port 3000 in use:**
```bash
lsof -ti:3000 | xargs kill -9
```

**UI changes not reflecting:**
1. Check dev mode is enabled
2. Verify dev server is running
3. Try manual webview reload

**Build failures:**
```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Getting Help

- Check existing [GitHub Issues](https://github.com/your-org/code-charter/issues)
- Review [Debugging Guide](./DEBUGGING.md)
- Ask in development chat/forum

## Additional Resources

- [Debugging Guide](./DEBUGGING.md) - Detailed debugging instructions
- [Architecture Decisions](../backlog/decisions/) - Design rationale
- [Task Backlog](../backlog/tasks/) - Current development tasks
- [VS Code Extension API](https://code.visualstudio.com/api) - Official docs
- [React Documentation](https://react.dev) - UI framework docs