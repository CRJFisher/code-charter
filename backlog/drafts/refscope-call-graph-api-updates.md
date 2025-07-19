# RefScope Call Graph API Requirements

## Overview

This document outlines the call graph API that was implemented in RefScope to support native call graph analysis. These additions enable RefScope to provide call graph functionality as a core feature, benefiting both the Code Charter VSCode extension and the broader RefScope ecosystem.

## Status: IMPLEMENTED ✅

The APIs described in this document have been implemented as of July 2025 through the following tasks:

- task-32: Define call graph data types and interfaces
- task-33: Implement get_definitions API
- task-34: Implement get_calls_from_definition API
- task-35: Implement get_call_graph high-level API
- task-40: Implement consistent symbol naming convention

## Motivation

Currently, Code Charter relies on a Docker-based SCIP parser and Golang call graph detector. To eliminate the Docker dependency and provide native TypeScript execution, RefScope now exposes call graph analysis capabilities. This provides:

- **Reusability**: Common functionality available to all RefScope users
- **Performance**: Direct access to AST and symbol information already in memory
- **Consistency**: Uniform call graph quality across all supported languages
- **Maintenance**: Analysis logic stays close to parsing logic

## Implemented APIs

### 1. Low-Level Building Blocks

#### `get_definitions(file_path: string): Def[]`

Returns all definitions (functions, methods, classes) in a file.

**Implementation Notes:**

- Uses the existing `Def` type rather than creating a new `Definition` type
- Available both as a Project method and standalone function
- Leverages the existing scope graph infrastructure

**Actual Type Used:**

```typescript
// From src/graph.ts
interface Def {
  name: string;
  symbol_kind:
    | "function"
    | "method"
    | "class"
    | "variable"
    | "const"
    | "let"
    | "constant"
    | "generator"
    | "constructor";
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
  symbol_id: string; // Added by task-40
}
```

#### `get_calls_from_definition(def: Def): FunctionCall[]`

Returns all function/method calls made within a definition's body.

**Implementation Features:**

- Resolves imports to actual definitions using `get_imports_with_definitions`
- Handles method calls across different languages (Python, TypeScript, JavaScript, Rust)
- Tracks whether calls are method calls vs function calls

**Actual Type Used:**

```typescript
interface FunctionCall {
  caller_def: Def; // The function making the call
  called_def: Def; // The function being called
  call_location: Point; // Where in the caller the call happens
  is_method_call: boolean; // true for self.method() or this.method()
}
```

### 2. High-Level Convenience API

#### `get_call_graph(options?: CallGraphOptions): CallGraph`

Builds a complete call graph for the project.

**Available as:**

- Instance method: `project.get_call_graph(options)`
- Standalone function: `get_call_graph(root_path, options)`

**Implemented Options:**

```typescript
interface CallGraphOptions {
  include_external?: boolean; // Include calls to external libraries (default: false)
  max_depth?: number; // Limit recursion depth from top-level nodes
  file_filter?: (path: string) => boolean; // Filter which files to analyze
}
```

**Actual Return Types:**

```typescript
interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallGraphEdge[];
  top_level_nodes: string[]; // Symbols not called by others
}

interface CallGraphNode {
  symbol: string; // Symbol ID in format module#name
  definition: Def;
  calls: Call[]; // Outgoing calls from this node
  called_by: string[]; // Incoming calls (symbol names)
}

interface CallGraphEdge {
  from: string; // Caller symbol
  to: string; // Callee symbol
  location: SimpleRange; // Where the call occurs
}

interface Call {
  symbol: string; // Symbol being called
  range: SimpleRange; // Location of the call
  kind: "function" | "method" | "constructor"; // Type of call
  resolved_definition?: Def; // The definition being called (if resolved)
}
```

## Symbol Naming Convention (task-40)

A consistent symbol naming scheme was implemented:

- Format: `<module_path>#<symbol_name>`
- Module path has extension removed and uses forward slashes
- Examples:
  - `src/utils/helpers#process_data`
  - `models/user#User.validate` (for methods)
  - `lib/math#<anonymous_line_42_col_10>` (for anonymous functions)

Key functions:

- `get_symbol_id(def: Def): string` - Generate symbol ID
- `parse_symbol_id(symbol_id: string)` - Parse symbol ID into components
- `normalize_module_path(file_path: string)` - Normalize file paths

## Implementation Features

### Cross-File Import Resolution

- Leverages the import resolution APIs from task-22
- `get_calls_from_definition` automatically resolves imported functions
- Handles circular dependencies between modules

### Language Support

All APIs work with:

- **TypeScript/JavaScript**: ES6 imports, CommonJS (limited), arrow functions
- **Python**: imports, class methods, decorators
- **Rust**: mod imports, impl blocks, trait methods

### Performance Features

- Efficient filtering with `file_filter` option
- `max_depth` uses BFS from top-level nodes
- Large project test shows <2s for 30+ files

### Known Limitations

- CommonJS require/exports have limited support
- External library calls not fully tracked (would require node_modules parsing)
- Module path resolution uses brute-force search (noted in task-22)

## Usage Examples

### Basic Usage

```typescript
// Get all functions in a file
const defs = get_definitions("src/utils.ts");

// Get calls from a specific function
const mainFunc = defs.find((d) => d.name === "main");
const calls = project.get_calls_from_definition(mainFunc);

// Build complete call graph
const callGraph = project.get_call_graph({
  file_filter: (path) => !path.includes("test"),
  max_depth: 5,
});
```

### Analyzing Cross-File Dependencies

```typescript
const callGraph = get_call_graph("./src", {
  include_external: false,
  file_filter: (path) => path.endsWith(".ts"),
});

// Find entry points
console.log("Entry points:", callGraph.top_level_nodes);

// Trace calls from main
const mainNode = callGraph.nodes.get("src/index#main");
for (const call of mainNode.calls) {
  console.log(`main() calls ${call.symbol}`);
}
```

## Testing

Comprehensive test coverage includes:

- Unit tests for all APIs (src/call_graph.test.ts)
- Integration tests for multi-file scenarios (src/call_graph_integration.test.ts)
- Cross-file import resolution tests
- Circular dependency handling
- Performance tests with large codebases

## Future Enhancements

### Planned: Polymorphic Call Resolution (task-43)

Enable tracing through specific implementation classes rather than abstract base classes:

```typescript
const callGraph = project.get_call_graph({
  implementation_mappings: {
    "models#Storage.save": "models#PostgresStorage.save",
    "interfaces#Logger.log": "utils#ConsoleLogger.log",
  },
});
```

### Potential Future Work

1. Visualization helpers for graph rendering
2. Streaming API for very large graphs
3. Call graph diffing between versions
4. Dead code detection using unreachable nodes
5. Test coverage mapping

## Migration Path for Code Charter

Code Charter can now:

1. Replace Docker-based SCIP/Golang solution with native RefScope APIs
2. Use `get_call_graph()` for complete project analysis
3. Leverage symbol IDs for consistent node identification
4. Apply filters for targeted analysis

## Benefits Realized

These APIs now enable:

- ✅ IDE features: Call hierarchy, find callers/callees
- ✅ Static analysis: Identify top-level entry points
- ✅ Documentation: Data for auto-generated call graphs
- ✅ Refactoring: Impact analysis for function changes
- ✅ Testing: Identify which functions call which others

## Implementation Details

For implementation details, see:

- src/index.ts: Main API implementations
- src/graph.ts: Type definitions
- src/symbol_naming.ts: Symbol ID generation
- src/call_graph.test.ts: API usage examples
- src/call_graph_integration.test.ts: Multi-file scenarios
