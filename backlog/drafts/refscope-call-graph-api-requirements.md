# RefScope Call Graph API Requirements

## Overview

This document outlines the proposed API additions to RefScope to support native call graph analysis. These additions would enable RefScope to provide call graph functionality as a core feature, benefiting both the Code Charter VSCode extension and the broader RefScope ecosystem.

## Motivation

Currently, Code Charter relies on a Docker-based SCIP parser and Golang call graph detector. To eliminate the Docker dependency and provide native TypeScript execution, we need RefScope to expose call graph analysis capabilities. Rather than implementing this in each consumer, adding it to RefScope provides:

- **Reusability**: Common functionality available to all RefScope users
- **Performance**: Direct access to AST and symbol information already in memory
- **Consistency**: Uniform call graph quality across all supported languages
- **Maintenance**: Analysis logic stays close to parsing logic

## Proposed API Additions

### 1. Low-Level Building Blocks

#### `get_definitions(file_path: string): Definition[]`

Returns all definitions (functions, methods, classes) in a file.

**Use Cases:**

- Building file outlines
- Analyzing code structure
- Custom filtering of definitions
- Incremental call graph construction

**Example Return Type:**

```typescript
interface Definition {
  name: string;
  kind: "function" | "method" | "class" | "variable";
  range: Range;
  file: string;
  enclosing_range?: Range; // Full body range including definition
  signature?: string; // Full signature with parameters
  docstring?: string; // Documentation comment if available
}
```

#### `get_calls_from_definition(def: Definition): Call[]`

Returns all function/method calls made within a definition's body.

**Use Cases:**

- Analyzing function complexity
- Building custom dependency graphs
- Finding specific call patterns
- Debugging call relationships

**Example Return Type:**

```typescript
interface Call {
  symbol: string; // Symbol being called
  range: Range; // Location of the call
  kind: "function" | "method" | "constructor";
  resolved?: Definition; // The definition being called (if resolved)
}
```

### 2. High-Level Convenience API

#### `get_call_graph(options?: CallGraphOptions): CallGraph`

Builds a complete call graph for the project.

**Options:**

```typescript
interface CallGraphOptions {
  include_external?: boolean; // Include calls to external libraries
  max_depth?: number; // Limit recursion depth
  file_filter?: (path: string) => boolean; // Filter which files to analyze
}
```

**Return Type:**

```typescript
interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallGraphEdge[];
  top_level_nodes: string[]; // Symbols not called by others
}

interface CallGraphNode {
  symbol: string;
  definition: Definition;
  calls: Call[]; // Outgoing calls from this node
  called_by: string[]; // Incoming calls (symbol names)
}

interface CallGraphEdge {
  from: string; // Caller symbol
  to: string; // Callee symbol
  location: Range; // Where the call occurs
}
```

## Data Type Recommendations

### 1. Align with RefScope's Existing Types

Use RefScope's existing `Range`, `Position`, and file path conventions for consistency.

### 2. Symbol Naming Convention

Recommend adopting a consistent symbol naming scheme:

- Format: `<module_path>#<name>`
- Example: `src.utils.helpers#process_data`

### 3. Hierarchical Information

Include enough information to reconstruct the hierarchical structure:

- Enclosing ranges for scope analysis
- Parent/child relationships for nested definitions
- Container symbols for methods in classes

## Implementation Notes

### Language-Specific Considerations

Different languages may require different approaches:

- **Python**: Handle decorators, class methods, nested functions
- **JavaScript/TypeScript**: Handle arrow functions, callbacks, async patterns
- **Rust**: Handle trait implementations, macro expansions

### Performance Considerations

- Cache call graphs at the file level
- Support incremental updates when files change
- Provide async APIs for large codebases

### Error Handling

- Gracefully handle unresolved symbols
- Provide partial results when some files fail to parse
- Include diagnostic information for debugging

## Migration Path for Code Charter

1. **Phase 1**: Implement basic APIs in RefScope
   - `get_definitions()`
   - `get_calls_from_definition()`
2. **Phase 2**: Add high-level call graph API
   - `get_call_graph()`
3. **Phase 3**: Update Code Charter to use new APIs
   - Replace Docker-based SCIP/Golang solution
   - Adapt data structures to match RefScope format
4. **Phase 4**: Remove legacy code
   - Delete Docker dependencies
   - Remove SCIP parsing code
   - Clean up temporary adapters

## Benefits Beyond Code Charter

These APIs would enable:

- IDE features: Call hierarchy, find callers/callees
- Static analysis: Dead code detection, circular dependency analysis
- Documentation: Auto-generated call graphs
- Refactoring: Impact analysis for function changes
- Testing: Identify which tests cover which functions

## Open Questions

1. Should RefScope provide visualization helpers or just raw graph data?
2. How should external/library calls be represented?
3. Should the API support streaming for large graphs?
4. What caching strategy should be used for call graphs?
