---
id: task-6.2
title: Create backend abstraction layer for UI package
status: To Do
assignee: []
created_date: '2025-08-01'
labels: []
dependencies: []
parent_task_id: task-6
---

## Description

Design and implement a backend interface that abstracts VSCode-specific APIs, allowing the UI to work with different backend implementations (VSCode, MCP server, mock/demo).

## Acceptance Criteria

- [ ] CodeCharterBackend interface defined with all required methods
- [ ] VSCode backend adapter implemented using existing postMessage API
- [ ] Mock backend implementation for testing and demos
- [ ] Backend provider/factory pattern for runtime selection
- [ ] All existing API calls migrated to use the abstraction

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
