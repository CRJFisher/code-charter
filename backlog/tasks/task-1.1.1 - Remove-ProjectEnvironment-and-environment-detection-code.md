---
id: task-1.1.1
title: Remove ProjectEnvironment and environment detection code
status: Done
assignee:
  - "@chuck"
created_date: "2025-07-19"
updated_date: "2025-07-19"
labels: []
dependencies: []
parent_task_id: task-1.1
---

## Description

The ProjectEnvironment abstraction was needed for the old SCIP parser to access device-specific environments (e.g., Python virtual environments). With refscope using tree-sitter, we parse code statically and don't need environment detection. Remove all ProjectEnvironment-related code and simplify the API.

## Acceptance Criteria

- [x] All ProjectEnvironment classes removed
- [x] detectEnvironments function removed from command handlers
- [x] getCallGraphForEnvironment renamed to getCallGraph
- [x] Environment selection UI removed from webview
- [x] Direct workspace path used instead of environment abstraction

## Implementation Plan

1. Analyze all ProjectEnvironment usage in the codebase
2. Remove detectEnvironments function from extension.ts
3. Remove ProjectEnvironment interface and implementations
4. Update getCallGraphForEnvironment to getCallGraph
5. Remove environment selection logic from webview
6. Update all references to use direct workspace paths
7. Clean up unused imports and types

## Implementation Notes

### Changes Made

1. **Removed environment detection from extension.ts**:

   - Removed detectEnvironment import
   - Removed allEnvironments and selectedEnvironment variables
   - Removed detectEnvironments command handler
   - Renamed getCallGraphForEnvironment to getCallGraph
   - Updated to use workspace path directly instead of environment abstraction

2. **Updated webview API (vscodeApi.ts)**:

   - Removed ProjectEnvironmentId import
   - Removed detectEnvironments function
   - Renamed getCallGraphForEnvironment to getCallGraph
   - Updated exports

3. **Updated webview App.tsx**:

   - Removed environment detection imports
   - Removed ProjectEnvironmentId type import
   - Simplified detectEntryPoints to call getCallGraph directly
   - Removed environment selection logic

4. **Deleted files**:
   - src/project/projectTypeDetection.ts
   - src/project/python.ts

### Key Decisions

- Removed all ProjectEnvironment abstractions as they're not needed with tree-sitter
- Simplified to use first workspace folder directly
- Left type errors in summarization code to be fixed in task 1.1.2

### Note

- There are TypeScript compilation errors in the summarization code that expects the old CallGraph structure
- These will be addressed in task 1.1.2 when migrating to refscope types
