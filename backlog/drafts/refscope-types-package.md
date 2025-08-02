# Refscope Types Package

## Overview

Create a separate `ariadne-types` package that exports only type definitions from ariadne, with zero runtime code. This addresses the need for ariadne types in environments where bundle size is critical (like webviews) without requiring the full ariadne package.

## Problem Statement

The Code Charter VSCode extension's webview needs to use ariadne's type definitions for proper type safety across the extension-webview boundary. However, installing the full ariadne package in the webview would unnecessarily bloat the bundle size since only types are needed - no runtime functionality is required.

## Proposed Solution

Publish a `ariadne-types` package that contains only TypeScript type definitions extracted from ariadne.

### Package Structure

```
ariadne-types/
├── package.json
├── index.d.ts
├── types/
│   ├── graph.d.ts      # CallGraph, CallGraphNode, etc.
│   ├── definitions.d.ts # Def, Ref, etc.
│   ├── common.d.ts     # Point, SimpleRange, etc.
│   └── index.d.ts      # Re-exports all types
└── README.md
```

### package.json

```json
{
  "name": "ariadne-types",
  "version": "1.0.0",
  "description": "TypeScript type definitions for ariadne",
  "types": "index.d.ts",
  "files": ["index.d.ts", "types/**/*.d.ts"],
  "peerDependencies": {
    "typescript": ">=4.0.0"
  },
  "keywords": ["ariadne", "types", "typescript"],
  "license": "MIT"
}
```

### Key Types to Export

Based on Code Charter's usage, the following types should be included:

```typescript
// Core graph types
export interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: CallGraphEdge[];
  top_level_nodes: string[];
}

export interface CallGraphNode {
  symbol: string;
  definition: Def;
  calls: Call[];
  called_by: string[];
}

export interface CallGraphEdge {
  from: string;
  to: string;
  location: SimpleRange;
}

// Definition types
export interface Def {
  name: string;
  symbol_kind: SymbolKind;
  range: SimpleRange;
  file_path: string;
  enclosing_range?: SimpleRange;
  parent?: string;
  metadata?: DefMetadata;
  symbol_id: string;
}

export interface Call {
  symbol: string;
  range: SimpleRange;
  kind: "function" | "method" | "constructor";
  resolved_definition?: Def;
}

// Common types
export interface Point {
  row: number;
  column: number;
}

export interface SimpleRange {
  start: Point;
  end: Point;
}

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "variable"
  | "const"
  | "let"
  | "constant"
  | "generator"
  | "constructor";

export interface DefMetadata {
  signature?: string;
  docstring?: string;
  class_name?: string;
  is_async?: boolean;
  decorators?: string[];
}
```

## Implementation Steps

1. **Extract type definitions** from ariadne source code
2. **Create new npm package** `ariadne-types`
3. **Set up build process** to keep types in sync with main ariadne package
4. **Publish to npm** with same versioning as ariadne
5. **Update ariadne** to optionally depend on ariadne-types for its own type exports

## Benefits

1. **Zero runtime overhead** - Only TypeScript definitions, no JavaScript code
2. **Small package size** - Just a few KB of type definitions
3. **Perfect for webviews** - Can use types without bundle bloat
4. **Version synchronization** - Can be kept in sync with ariadne releases
5. **Broader ecosystem support** - Other tools can use ariadne types without the full package

## Maintenance Strategy

- **Automated sync**: Set up CI to extract and publish types when ariadne releases
- **Version matching**: Use same version numbers as ariadne for clarity
- **Breaking changes**: Only when ariadne has breaking type changes

## Alternative Approaches Considered

1. **`@types/ariadne`** - Not appropriate since ariadne is already TypeScript
2. **Type exports from main package** - Still requires installing full package
3. **Duplicating types in consumer** - Maintenance burden and sync issues

## Usage Example

In webview code:

```typescript
import type { CallGraph, Def, CallGraphNode } from "ariadne-types";

// Use types for proper type safety without runtime dependency
function processCallGraph(graph: CallGraph): void {
  // Type-safe code
}
```

In extension code (can use either):

```typescript
// Option 1: Use full ariadne
import { CallGraph, get_call_graph } from "ariadne";

// Option 2: Just types (if only needed for type annotations)
import type { CallGraph } from "ariadne-types";
```

## Next Steps

1. Create the ariadne-types package structure
2. Extract current type definitions from ariadne
3. Set up npm package and publish
4. Update Code Charter to use ariadne-types in webview
