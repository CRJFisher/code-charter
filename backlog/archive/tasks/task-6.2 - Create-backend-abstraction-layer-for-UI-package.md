---
id: task-6.2
title: Create backend abstraction layer for UI package
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

Design and implement a backend interface that abstracts VSCode-specific APIs, allowing the UI to work with different backend implementations (VSCode, MCP server, mock/demo).

## Acceptance Criteria

- [x] CodeCharterBackend interface defined with all required methods
- [x] VSCode backend adapter implemented using existing postMessage API
- [x] Mock backend implementation for testing and demos
- [x] Backend provider/factory pattern for runtime selection
- [ ] All existing API calls migrated to use the abstraction

## Implementation Plan

1. Analyze existing VSCode postMessage API usage in the webview
2. Design CodeCharterBackend interface with all required methods
3. Create backend types and interfaces in UI package
4. Implement VSCodeBackendAdapter wrapping existing postMessage API
5. Create MockBackend with sample data for testing/demos
6. Implement BackendProvider factory pattern for runtime selection
7. Migrate existing API calls to use the abstraction
8. Add connection status and error handling
9. Test all backend implementations

## Technical Details

### Current VSCode Dependencies to Abstract

- **vscodeApi.ts** - Direct coupling to VSCode webview API via `acquireVsCodeApi()`
- **Navigation** - `navigateToDoc` function depends on VSCode's file opening capability
- **Message passing** - Current implementation uses VSCode's postMessage API

### Required Backend Interface

```typescript
interface CodeCharterBackend {
  getCallGraph(): Promise<CallGraph>
  summariseCodeTree(symbol: string): Promise<TreeAndContextSummaries>
  clusterCodeTree(symbol: string): Promise<NodeGroup[]>
  navigateToDoc(path: string, line: number): Promise<void>
}
```

### Implementation Notes

- The VSCode adapter should wrap the existing postMessage implementation
- Mock backend can return sample data for demos
- Consider adding connection status and error handling to the interface

Successfully created backend abstraction layer in @code-charter/ui package. Implemented CodeCharterBackend interface with connection management, VSCodeBackend adapter wrapping postMessage API, MockBackend with sample data, and BackendProvider factory pattern. Added React hook (useBackend) for easy integration. The actual migration of existing API calls will be done in task 6.3 when extracting UI components. Modified files: packages/ui/src/backends/*, packages/ui/src/hooks/*, packages/ui/src/index.tsx
