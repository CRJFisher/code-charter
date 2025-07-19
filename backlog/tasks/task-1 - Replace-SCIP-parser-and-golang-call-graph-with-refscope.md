---
id: task-1
title: Replace SCIP parser and golang call graph with refscope
status: In Progress
assignee:
  - "@chuck"
created_date: "2025-07-15"
updated_date: "2025-07-17"
labels: []
dependencies: []
---

## Description

The VSCode extension currently relies on SCIP parser and golang-based call graph detection code that requires Docker to run. This task involves migrating to the new [refscope](https://www.npmjs.com/package/refscope) TypeScript library to eliminate the Docker dependency and enable native execution within the VSCode extension.

## Acceptance Criteria

- [ ] SCIP parser is no longer required
- [ ] Golang call graph detection code is removed
- [ ] refscope library is integrated into the VSCode extension
- [ ] Call graph detection works natively without Docker
- [ ] All existing call graph functionality is preserved
- [ ] Docker dependency and setup instructions are removed
- [ ] Extension can generate call graphs for supported languages using refscope
- [ ] Extensive unit tests are written for the refscope integration

## Implementation Plan

1. Install and explore refscope library capabilities
2. Create TypeScript module to replace golang call graph detector
3. Implement SCIP-equivalent parsing using refscope
4. Port call graph detection logic from golang to TypeScript
5. Remove Docker dependencies from VSCode extension
6. Update extension to use native refscope implementation
7. Test with existing Python projects
8. Remove Docker-related code and documentation

## Implementation Analysis

### Current Architecture Overview

The existing system uses a Docker-based architecture with two main components:

1. **SCIP Python Parser** (`crjfisher/codecharter-scip-python`):

   - Generates SCIP index files from Python source code
   - Located in `docker/scip-python/`
   - Called from `src/project/python.ts:29-47`

2. **Golang Call Graph Detector** (`crjfisher/codecharter-detectcallgraphs`):
   - Reads SCIP protobuf files and extracts call graphs
   - Main logic in `cmd/main.go`
   - Outputs JSON file with call graph data

### Key Integration Points to Update

#### 1. Extension Entry Point (`src/extension.ts`)

- **Lines 317-324**: Docker command execution for call graph detection
- **Line 167**: Calls `detectTopLevelFunctions()` which triggers Docker-based detection
- **Line 323**: Reads the resulting `call_graph.json` file
- **Lines 31-36**: Docker availability check

#### 2. Python Environment Handler (`src/project/python.ts`)

- **Lines 29-47**: `parseCodebaseToScipIndex()` method runs SCIP Python Docker container
- Generates pip packages list for SCIP indexing
- Creates SCIP index files on disk

#### 3. Data Model Differences

**Current SCIP/Golang structure** (in `shared/codeGraph.ts`):

```typescript
interface DefinitionNode {
  enclosingRange: DocRange;
  document: string;
  symbol: string;
  children: ReferenceNode[];
}
```

**New RefScope structure** (in `call_graph_detector.ts`):

```typescript
interface DefinitionNode {
  docstring: string;
  signature: string;
  source: string;
  containerSymbol: string;
  filePath: string;
  lineNumber: number;
}
```

### Golang Call Graph Logic to Port

The golang implementation (`cmd/main.go`) performs:

1. **SCIP Index Parsing** (lines 145-149): Reads protobuf SCIP index
2. **Symbol Extraction** (lines 191-235):
   - Filters local symbols
   - Identifies definitions vs references
   - Checks for method/function symbols
3. **Scope Analysis** (lines 274-334):
   - Uses a scope stack to find which references are enclosed in which definitions
   - Sorts occurrences by line number
   - Builds parent-child relationships
4. **Call Graph Construction** (lines 336-393):
   - Identifies top-level nodes (not referenced by others)
   - Builds recursive call graphs
   - Handles circular references
5. **JSON Output** (lines 395-443):
   - Outputs hierarchical structure with ranges and symbols

### RefScope Integration Status

A partial implementation exists in `code-charter-vscode/src/code_parsing/call_graph_detector.ts`:

- ✅ Basic file discovery and project loading
- ✅ Framework for extracting call graphs
- ❌ `get_all_definitions_in_file()` not implemented
- ❌ Missing `CallGraphItem` type definition
- ❌ Not integrated into main extension flow
- ❌ Data structure incompatible with existing consumers

### Migration Challenges

1. **Data Structure Mismatch**: Need to either:

   - Update all consumers to use new structure
   - Create adapter layer for backward compatibility

2. **Missing RefScope APIs**:

   - No direct method to get all definitions in a file
   - May need to extend refscope or use tree-sitter directly

3. **Feature Parity**:

   - Ensure enclosing ranges are captured
   - Maintain hierarchical parent-child relationships
   - Support same symbol resolution quality

4. **Testing Requirements**:
   - Need comprehensive tests comparing SCIP vs RefScope outputs
   - Ensure no regression in call graph quality
