---
id: task-13
title: Migrate from @ariadnejs v0.5.x to v0.8.0
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies: []
---

## Description

The ariadne code intelligence library has been completely rewritten between v0.5.x and v0.8.0. Code-charter depends on @ariadnejs/core (v0.5.18) and @ariadnejs/types (v0.5.15) across all three packages (types, vscode, ui). The v0.8.0 API introduces branded types (SymbolId, FilePath, SymbolName), renamed core types (CallGraphNode→CallableNode, Call→CallReference), restructured CallGraph (top_level_nodes→entry_points, edges removed), changed Project API (add_or_update_file→update_file, requires initialize()), and multi-candidate call resolution (Call.symbol→CallReference.resolutions[]). This is a comprehensive migration touching ~20 files across all packages.

## Acceptance Criteria

- [ ] All package.json dependencies updated to @ariadnejs v0.8.0
- [ ] @code-charter/types re-exports new types (CallableNode CallGraph CallReference SymbolId etc)
- [ ] AriadneProjectManager uses new Project API (initialize + update_file + load_project)
- [ ] All CallGraphNode references replaced with CallableNode throughout codebase
- [ ] All node.symbol accesses replaced with node.symbol_id
- [ ] All node.calls accesses replaced with node.enclosed_calls with resolution traversal
- [ ] All Def property accesses migrated (definition.file_path→definition.location.file_path and definition.range.start.row→definition.location.start_line)
- [ ] All CallGraph.top_level_nodes replaced with CallGraph.entry_points
- [ ] All CallGraph.edges usages removed (edges are now implicit)
- [ ] UI components render correctly with new data shapes
- [ ] All mock data updated to new type shapes
- [ ] All tests pass with new API
- [ ] TypeScript compilation succeeds with zero type errors
- [ ] clustering_service_old.ts deleted (no legacy code)

## Implementation Plan

### Overview

This is a direct migration with no adapter/shim layer (per project rule: NO BACKWARDS COMPATIBILITY). The migration proceeds bottom-up through the dependency tree across 6 phases. ~20 files across all 3 packages need changes.

### Complete API Change Reference

| Old (v0.5.x) | New (v0.8.0) | Notes |
|---|---|---|
| `CallGraphNode` | `CallableNode` | Type rename |
| `CallGraphNode.symbol: string` | `CallableNode.symbol_id: SymbolId` | Branded string |
| `CallGraphNode.calls: Call[]` | `CallableNode.enclosed_calls: readonly CallReference[]` | Renamed + restructured |
| `CallGraphNode.definition: Def` | `CallableNode.definition: AnyDefinition` | Union type |
| `CallGraphNode.called_by: string[]` | _(removed)_ | No equivalent |
| _(none)_ | `CallableNode.name: SymbolName` | New field: display name |
| _(none)_ | `CallableNode.location: Location` | New field: location directly on node |
| _(none)_ | `CallableNode.is_test: boolean` | New field |
| `Call.symbol: string` | `CallReference.resolutions[].symbol_id: SymbolId` | Multi-candidate resolution |
| `Call.range: SimpleRange` | `CallReference.location: Location` | Different shape |
| `Call.kind: string` | `CallReference.call_type: "function" \| "method" \| "constructor"` | Renamed + typed |
| `Def.file_path: string` | `AnyDefinition.location.file_path: FilePath` | Nested under `location` |
| `Def.range.start.row` | `AnyDefinition.location.start_line` | Flattened, renamed |
| `Def.range.end.row` | `AnyDefinition.location.end_line` | Flattened, renamed |
| `Def.name: string` | `AnyDefinition.name: SymbolName` | Branded string |
| `CallGraph.nodes: Map<string, CallGraphNode>` | `CallGraph.nodes: ReadonlyMap<SymbolId, CallableNode>` | ReadonlyMap + branded key |
| `CallGraph.top_level_nodes: string[]` | `CallGraph.entry_points: readonly SymbolId[]` | Renamed |
| `CallGraph.edges: CallGraphEdge[]` | _(removed)_ | Edges implicit via `enclosed_calls` |
| `Project.add_or_update_file(path, content)` | `Project.update_file(path as FilePath, content)` | Renamed + branded type |
| `Project.remove_file(path)` | `Project.remove_file(path as FilePath)` | Branded type |
| _(none)_ | `Project.initialize()` | Required before `update_file` |
| `get_call_graph(root_path, options)` | `load_project({ project_path }) + project.get_call_graph()` | Standalone function removed |

### Critical Pattern: Call Resolution Traversal

The biggest conceptual change is call traversal. In v0.5, `Call.symbol` gave a direct target. In v0.8, `CallReference.resolutions` is an array of candidates. Create a shared helper:

```typescript
// packages/vscode/src/ariadne/call_graph_utils.ts
import type { CallReference, SymbolId } from "@ariadnejs/types";

export function get_resolved_symbol_id(call_ref: CallReference): SymbolId | undefined {
  return call_ref.resolutions[0]?.symbol_id;
}

export function get_all_resolved_ids(call_ref: CallReference): SymbolId[] {
  return call_ref.resolutions.map(r => r.symbol_id);
}
```

Old pattern (~12 locations):
```typescript
node.calls.forEach(call => { graph.nodes.get(call.symbol); });
```

New pattern:
```typescript
node.enclosed_calls.forEach(call_ref => {
  const resolved_id = get_resolved_symbol_id(call_ref);
  if (resolved_id) { graph.nodes.get(resolved_id); }
});
```

---

### Phase 1: Foundation — `@code-charter/types` Package

**Files:**
- `packages/types/package.json` — bump `@ariadnejs/types` from `^0.5.0` to `^0.8.0`
- `packages/types/src/index.ts` — change re-exports
- `packages/types/src/backend.ts` — update type references

**`packages/types/src/index.ts` changes:**
```typescript
// Old:
export type { CallGraph, CallGraphNode } from '@ariadnejs/types';
// New:
export type { CallGraph, CallableNode, CallReference, SymbolId, SymbolName, FilePath, AnyDefinition, Location } from '@ariadnejs/types';
```

**`packages/types/src/backend.ts` changes:**
- Import: `CallGraphNode` → `CallableNode`
- `TreeAndContextSummaries.callTreeWithFilteredOutNodes`: `Record<string, CallGraphNode>` → `Record<string, CallableNode>`
- `CodeCharterBackend` interface: return types update via `CallGraph` shape change (no code change needed, type flows through)

---

### Phase 2: VSCode Backend — Project Manager & Shared Utilities

**Files:**
- `packages/vscode/package.json` — bump `@ariadnejs/core` to `^0.8.0`, `@ariadnejs/types` to `^0.8.0`
- `packages/vscode/src/ariadne/project_manager.ts` — primary integration point
- `packages/vscode/shared/codeGraph.ts` — shared utilities
- `packages/vscode/shared/symbols.ts` — symbol name parsing

**`project_manager.ts` — Major rewrite:**

Strategy: Use `load_project()` for initial loading, keep `Project` reference for incremental updates.

1. Imports: `import { Project, load_project } from "@ariadnejs/core"` + `import type { CallGraph, FilePath } from "@ariadnejs/types"`
2. Constructor becomes lightweight (no Project creation)
3. `initialize()`:
   - Replace manual `scanDirectory()` + `new Project()` + `add_or_update_file()` with `load_project({ project_path, file_filter, exclude: [...] })`
   - This eliminates `scanDirectory()`, `shouldSkipDirectory()`, `addFileToProject()` methods
   - Set up file watchers after load
4. File watchers:
   - `onDidCreate`: read file, call `project.update_file(absolutePath as FilePath, content)`
   - `onDidChange`: same as create
   - `onDidDelete`: call `project.remove_file(absolutePath as FilePath)`
   - `handleDocumentChange`: call `project.update_file(absolutePath as FilePath, doc.getText())`
5. **Critical**: Old API used relative paths; new API uses absolute paths branded as `FilePath`
6. `getCallGraph()`: returns new `CallGraph` type (no code change, type flows through)

**`shared/codeGraph.ts` changes:**
- Remove `Def` import (no longer exists)
- `CallGraphNode` → `CallableNode`
- `countNodes` function: `node.calls.reduce(...)` → `node.enclosed_calls.reduce(...)` with resolution traversal
- Re-exports: export `CallableNode` instead of `CallGraphNode`

**`shared/symbols.ts` changes:**
- Old `SymbolId` format split on `#` — new format is colon-separated `kind:file_path:sl:sc:el:ec:name`
- Best approach: use `CallableNode.name` directly where possible (new field), keep string parser as fallback updated for new format
- `symbolDisplayName`: split on `:`, take last segment (the name)

---

### Phase 3: Summarisation Pipeline

**Files:**
- `packages/vscode/src/summarise/summarise.ts` — heaviest downstream consumer (~8+ locations)
- `packages/vscode/src/summarise/summariseClusters.ts` — cluster graph builder
- `packages/vscode/src/summarise/caching.ts` — no changes needed (string keys agnostic to ariadne types)

**`summarise.ts` — Detailed property access changes:**

| Function | Old Access | New Access |
|---|---|---|
| `getAllDefinitionNodesFromCallGraph` | `node.symbol`, `node.calls.forEach(child => graph.nodes.get(child.symbol))` | `node.symbol_id`, `node.enclosed_calls.forEach(call_ref => { for (r of call_ref.resolutions) graph.nodes.get(r.symbol_id) })` |
| `getSymbolToFunctionCode` | `n.definition.file_path`, `n.definition.range.start.row`, `n.definition.range.end.row` | `n.definition.location.file_path`, `n.definition.location.start_line`, `n.definition.location.end_line` |
| `getFunctionBusinessLogic` | `node.symbol`, `hashText(node.symbol)` | `node.symbol_id`, `hashText(node.symbol_id)` |
| `getCallGraphItemsWithFilteredOutFunctions` | `node.calls.filter(...)`, `child.symbol`, `{...node, calls: newChildren}` | `node.enclosed_calls.filter(...)`, resolution lookup, `{...node, enclosed_calls: newChildren}` |

**Important**: `AnyDefinition` is a discriminated union but all variants have `.location`. The `.location` access is safe without type narrowing.

**Line number indexing**: Old `range.start.row` was 0-based (tree-sitter). Verify if `location.start_line` is also 0-based. If 1-based, adjust `codeLines.slice()` calls accordingly.

**`summariseClusters.ts` changes:**
- `callGraph.nodes.get(member.symbol)` → needs `member.symbol as SymbolId` cast (or update `ClusterMember.symbol` type to `SymbolId`)
- `node?.calls?.map(call => symbolToClusterId[call.symbol])` → iterate `node?.enclosed_calls` with resolution lookup

---

### Phase 4: Clustering Service

**Files:**
- `packages/vscode/src/clustering/clustering_service.ts` — adjacency matrix builder
- `packages/vscode/src/clustering/clustering_service_old.ts` — **DELETE** (dead legacy code)
- `packages/vscode/src/clustering/local_embeddings_provider.ts` — no changes (ariadne-agnostic)
- `packages/vscode/src/clustering/embedding_provider_selector.ts` — no changes

**`clustering_service.ts` changes:**
- Import: `CallGraphNode` → `CallableNode, SymbolId, CallReference` from `@ariadnejs/types`
- `cluster()` parameter: `Record<string, CallGraphNode>` → `Record<string, CallableNode>`
- `createCombinedMatrix()`: the adjacency matrix loop changes from `node.calls.forEach(call => funcToIndex[call.symbol])` to `node.enclosed_calls.forEach(call_ref => { for (r of call_ref.resolutions) funcToIndex[r.symbol_id] })`
- Multi-resolution actually improves clustering quality by capturing polymorphic relationships

---

### Phase 5: UI Package

**Files (7 source + 2 test):**

**`packages/ui/package.json`:**
- Bump `@ariadnejs/core` to `^0.8.0`
- **Add** `@ariadnejs/types: "^0.8.0"` as direct dependency (v0.8 core no longer re-exports types)

**`react_flow_data_transform.ts` — Densest concentration of changes:**
- `CallGraphNode` → `CallableNode` in all signatures
- `node.symbol` → `node.symbol_id` (~10 locations)
- `node.definition.file_path` → `node.definition.location.file_path`
- `node.definition.range.start.row` → `node.definition.location.start_line`
- `node.calls.forEach((call, index) => ...)` → `node.enclosed_calls.forEach(...)` with resolution extraction
- `call.symbol` → `call.resolutions[0]?.symbol_id` (or iterate all for polymorphic calls)
- `symbolDisplayName(node.symbol)` → use `node.name as string` directly (new field on `CallableNode`)

**`code_chart_area_react_flow.tsx`:**
- `CallGraphNode` → `CallableNode` in imports, props, state
- `selectedEntryPoint.symbol` → `selectedEntryPoint.symbol_id` (~7 locations)

**`side_bar.tsx`:**
- `call_graph.top_level_nodes.sort(...)` → `[...call_graph.entry_points].sort(...)` (must spread because readonly)
- `node.symbol` → `node.symbol_id`
- `node.calls` → `node.enclosed_calls` with resolution traversal
- `node.definition.file_path` → `node.definition.location.file_path`
- `node.definition.range.start.row` → `node.definition.location.start_line`
- Display name: use `node.name` directly instead of parsing symbol string

**`App.tsx`:**
- `CallGraphNode` → `CallableNode` in state type
- Default empty graph: `{ nodes: new Map(), top_level_nodes: [], edges: [] }` → `{ nodes: new Map(), entry_points: [] }`
- `selected_entry_point?.symbol` → `selected_entry_point?.symbol_id`

**`test_react_flow.tsx`:**
- Rewrite mock `CallGraphNode` objects to `CallableNode` shape with all new required fields

**`mock_backend.ts`:**
- Complete rewrite of mock data construction:
  - All `CallGraphNode` → `CallableNode` with `symbol_id`, `name`, `enclosed_calls`, `location`, `definition` (AnyDefinition), `is_test`
  - `CallGraph`: remove `edges`, `top_level_nodes` → `entry_points`, `nodes` as `Map<SymbolId, CallableNode>`
  - Remove `called_by` from all nodes
  - Create helper functions for branded type construction in mocks

**`test_mock_backend.ts`:**
- Fix broken `Backend` import → `CodeCharterBackend`
- Default `getCallGraph()` return: `{ nodes: {}, edges: [] }` → `{ nodes: new Map(), entry_points: [] }`

---

### Phase 6: Tests

**`ariadne-integration.test.ts`:**
- Replace `import { get_call_graph } from "@ariadnejs/core"` with `import { load_project } from "@ariadnejs/core"`
- API: `get_call_graph(path, options)` → `load_project({ project_path, file_filter }) + project.get_call_graph()`
- Remove `callGraph.edges` assertions
- `callGraph.top_level_nodes` → `callGraph.entry_points`
- `node.definition.file_path` → `node.location.file_path`
- `node.definition.range` → `node.location`

**`ariadne-project-manager.test.ts` + watcher + edge-cases + integration:**
- Minimal changes — assertions on `callGraph.nodes.size`, `nodes.keys()`, string-contains checks remain valid since `SymbolId` is structurally a string at runtime
- Verify error messages match new `update_file()` method name
- Integration test symbol key assertions may need format updates (new SymbolId format)

**`react_flow_data_transform.test.ts`:**
- `createMockNode` returns `CallableNode` instead of `CallGraphNode`
- All `.calls = [child]` mutations must change — `CallableNode` has `readonly` properties, so construct nodes with `enclosed_calls` pre-set
- Create helper for mock `CallReference` construction:
  ```typescript
  const call_ref = (target: CallableNode): CallReference => ({
    name: target.name,
    location: target.location,
    scope_id: "scope_0" as ScopeId,
    call_type: "function",
    resolutions: [{ symbol_id: target.symbol_id, confidence: "certain", reason: { type: "direct" } }],
  });
  ```

**`mock_backend.test.ts`:**
- Fix import (`MockBackend` → `TestMockBackend`)
- Update `mockCallGraph` to new shape
- `expect(callGraph.nodes).toEqual({})` → `expect(callGraph.nodes.size).toBe(0)`
- Remove `callGraph.edges` assertion

---

### Verification Strategy

At each phase:
1. Run `npm run typecheck` in affected package(s)
2. Run `npm run test` in affected package(s)

After all phases:
3. Run `npm run build` at root to verify cross-package compatibility
4. Manual integration test: open a workspace in VSCode, trigger diagram generation, verify the call graph renders correctly

### Potential Pitfalls

1. **Line number indexing**: Old `range.start.row` was 0-based (tree-sitter). Verify if `location.start_line` is also 0-based. If 1-based, `codeLines.slice()` calls need `start_line - 1`.

2. **Multi-candidate resolutions**: Some calls may resolve to multiple targets. For graph traversal (summarization, clustering, UI), iterate all resolutions to create edges to each target. For display purposes, use first resolution.

3. **Branded types at boundaries**: UI sends plain strings for symbols via `postMessage`. Cast to `SymbolId` at the webview message handler boundary.

4. **Map serialization via postMessage**: `ReadonlyMap` doesn't serialize to JSON naturally. Check if existing code already handles Map serialization (likely via structured clone). May need hydration step in `vscode_backend.ts`.

5. **SymbolId format in existing caches**: Summarization/embedding caches hash symbol strings. New `SymbolId` format differs from old, so caches naturally invalidate. No migration needed.

6. **`AnyDefinition` is a discriminated union**: Code accessing `.location` is safe (all variants have it). Code accessing specific fields like `.signature` needs type narrowing by `kind`.

7. **Absolute vs relative paths**: Old API used relative paths; new API uses absolute paths branded as `FilePath`. The `load_project` + file watchers must consistently use absolute paths.

### Complete File Inventory (20 files)

**Phase 1 — Types (3 files):**
- `packages/types/package.json`
- `packages/types/src/index.ts`
- `packages/types/src/backend.ts`

**Phase 2 — VSCode Backend (4 files):**
- `packages/vscode/package.json`
- `packages/vscode/src/ariadne/project_manager.ts`
- `packages/vscode/shared/codeGraph.ts`
- `packages/vscode/shared/symbols.ts`

**Phase 3 — Summarisation (2 files):**
- `packages/vscode/src/summarise/summarise.ts`
- `packages/vscode/src/summarise/summariseClusters.ts`

**Phase 4 — Clustering (2 files):**
- `packages/vscode/src/clustering/clustering_service.ts`
- `packages/vscode/src/clustering/clustering_service_old.ts` _(delete)_

**Phase 5 — UI (8 files):**
- `packages/ui/package.json`
- `packages/ui/src/components/code_chart_area/react_flow_data_transform.ts`
- `packages/ui/src/components/code_chart_area/code_chart_area_react_flow.tsx`
- `packages/ui/src/components/side_bar.tsx`
- `packages/ui/src/components/App.tsx`
- `packages/ui/src/components/code_chart_area/test_react_flow.tsx`
- `packages/ui/src/backends/mock_backend.ts`
- `packages/ui/src/backends/test_mock_backend.ts`

**Phase 6 — Tests (7 files):**
- `packages/vscode/src/__tests__/ariadne-integration.test.ts`
- `packages/vscode/src/__tests__/ariadne-project-manager.test.ts`
- `packages/vscode/src/__tests__/ariadne-project-manager-watcher.test.ts`
- `packages/vscode/src/__tests__/ariadne-project-manager-edge-cases.test.ts`
- `packages/vscode/src/__tests__/ariadne-project-manager-integration.test.ts`
- `packages/ui/src/components/code_chart_area/__tests__/react_flow_data_transform.test.ts`
- `packages/ui/src/backends/__tests__/mock_backend.test.ts`

**New file (1):**
- `packages/vscode/src/ariadne/call_graph_utils.ts` _(shared helper for call resolution traversal)_
