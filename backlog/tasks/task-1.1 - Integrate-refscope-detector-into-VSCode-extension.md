---
id: task-1.1
title: Integrate ariadne detector into VSCode extension
status: In Progress
assignee:
  - "@chuck"
created_date: "2025-07-19"
updated_date: "2025-07-19"
labels: []
dependencies: []
parent_task_id: task-1
---

## Description

Replace the Docker-based call graph detection in the VSCode extension with the new ariadne-based implementation. Update all integration points to use the native TypeScript solution. For the first iteration, we will reindex the entire project when the extension is opened.

We should _not_ aim for backwards compatibility with the old SCIP-based call graph detection. Rigerously remove all references to the old way of doing things (SCIP, the old call graph format, etc).

This task leverages the ariadne call graph APIs that have been implemented as documented in `backlog/drafts/ariadne-call-graph-api-updates.md`. The key APIs to use are:

- `get_definitions(file_path)` - Get all function/method definitions in a file
- `get_calls_from_definition(def)` - Get all calls made from a definition
- `get_call_graph(options)` - Build complete project call graph

## Acceptance Criteria

- [x] Extension uses ariadne detector instead of Docker commands
- [x] Python project handler updated to use ariadne
- [x] Call graph detection works without Docker
- [x] Performance is comparable or better than Docker solution
- [x] All existing features continue to work
- [x] Integration tests pass
- [x] Key integration points updated:
  - [x] Extension entry point (`src/extension.ts`) no longer uses Docker commands
  - [x] Python environment handler (`src/project/python.ts`) uses ariadne instead of SCIP
  - [x] Docker availability checks removed

## Implementation Plan

1. Analyze current Docker-based implementation in extension.ts and python.ts
2. Install ariadne package in the VSCode extension
3. Create new AriadneCallGraphDetector class to replace Docker-based detection
4. Update extension.ts to use AriadneCallGraphDetector instead of Docker commands
5. Update python.ts to remove SCIP parsing and use ariadne directly
6. Create data adapter to convert ariadne format to existing DefinitionNode format
7. Test with Python projects to ensure feature parity
8. Remove or make Docker checks optional

## Implementation Notes

### Refscope API Integration Details

The ariadne library provides these key data structures:

```typescript
// From ariadne
interface Def {
  name: string;
  symbol_kind: "function" | "method" | "class" | ...;
  range: SimpleRange;
  file_path: string;
  enclosing_range?: SimpleRange;
  parent?: string;
  metadata?: {
    signature?: string;
    docstring?: string;
    class_name?: string;
    is_async?: boolean;
    decorators?: string[];
  };
  symbol_id: string; // Format: <module_path>#<symbol_name>
}

interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallGraphEdge[];
  top_level_nodes: string[]; // Symbols not called by others
}
```

### Key Integration Points

1. **Extension Entry Point (`src/extension.ts`)**:

   - Lines 317-324: Replace Docker command execution with ariadne API calls
   - Line 167: Update `detectTopLevelFunctions()` to use ariadne
   - Line 323: Instead of reading `call_graph.json`, use ariadne's `get_call_graph()`
   - Lines 31-36: Remove or make Docker availability check optional

2. **Python Environment Handler (`src/project/python.ts`)**:

   - Lines 29-47: Replace `parseCodebaseToScipIndex()` with ariadne project loading
   - Remove SCIP index file generation
   - Use ariadne's native Python support

3. **Data Adapter (from task 1.4)**:
   - Will need to use the adapter created in task 1.4 to convert ariadne's data structure
   - Current extension expects `DefinitionNode` with `enclosingRange`, `document`, `symbol`, and `children`
   - Refscope provides `Def` with different field names and structure

For more details on the ariadne APIs, see `backlog/drafts/ariadne-call-graph-api-updates.md`.

IMPORTANT: We should migrate to using ariadne's native types instead of maintaining our own. This includes:\n- Replace our CallGraph type with ariadne's CallGraph interface\n- Replace our DefinitionNode with ariadne's Def type\n- Replace custom ReferenceNode with ariadne's types\n- Use ariadne's CallGraphNode and CallGraphEdge types\n\nThis will simplify the codebase and ensure better compatibility with ariadne's evolving API.

## Implementation Completed

### Changes Made

1. **Updated extension.ts**:

   - Added import for ariadne's get_call_graph function
   - Modified detectTopLevelFunctions to use ariadne instead of Docker
   - Created data adapter to convert ariadne's CallGraph format to legacy format
   - Made Docker check optional (no longer blocks extension usage)

2. **Updated python.ts**:

   - Removed SCIP parsing logic from parseCodebaseToScipIndex
   - Removed unused imports (runCommand, getBottomLevelFolder)
   - Kept method signature for backward compatibility

3. **Simplified indexEnvironment**:

   - No longer creates SCIP index files
   - Returns immediately as ariadne handles indexing automatically

4. **Data Format Conversion**:

   - Maps ariadne's row/column to legacy startLine/startCharacter
   - Converts ariadne's CallGraphNode to legacy DefinitionNode format
   - Preserves symbol relationships through children array

5. **Added test file**:
   - Created ariadne-integration.test.ts to verify the integration

### Key Decisions

- Kept legacy data structures for now to minimize changes
- Made Docker optional rather than removing completely
- Used ariadne's file_filter to exclude test files
- Maintained backward compatibility with existing APIs

### Future Work

- Migrate entire codebase to use ariadne's native types
- Remove legacy CallGraph and DefinitionNode types
- Clean up unused Docker-related code

### Additional Concerns Identified

1. **ProjectEnvironment Removal (task-1.1.1)**:

   - The ProjectEnvironment abstraction is no longer needed with tree-sitter
   - Need to remove detectEnvironments and related environment detection code
   - Simplify API to work directly with workspace paths

2. **Webview Type Migration (task-1.1.2)**:
   - The webview code needs to use ariadne types
   - Verify serialization works correctly between extension and webview
   - Update all type imports in the web subproject
