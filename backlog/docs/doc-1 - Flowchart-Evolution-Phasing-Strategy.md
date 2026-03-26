---
id: doc-1
title: Flowchart Evolution Phasing Strategy
type: other
created_date: "2026-03-25 09:36"
---

# Flowchart Evolution Phasing Strategy

Code Charter evolves from a call graph viewer to a flowchart viewer showing business logic control and data flow. This document sequences the work across four codebases (ariadne types, ariadne core, code-charter packages, code-charter UI) into phases that each deliver visible user value.

## Architecture Snapshot

**Current state:**

- Ariadne extracts call graphs: `CallableNode` has `enclosed_calls: CallReference[]`, each with `resolutions: Resolution[]`
- Ariadne's scope tree tracks block scopes for `if/for/while/try/catch/finally` but only as `ScopeType = "block"` -- no distinction between block kinds, no condition text, no sibling branch linking
- Code Charter UI renders a flat call graph with React Flow + ELK hierarchical layout
- Two node types exist: `code_function` (zoom-aware) and `module_group` (clustering)
- Edges are unlabeled, untyped "default" edges representing "calls" relationships
- Clustering groups functions into modules using embeddings; descriptions come from docstrings

**Target state:**

- Flowchart-style diagrams showing control flow within and across functions
- Decision diamonds, loop hexagons, I/O parallelograms
- Edge labels with branch conditions and data annotations
- Semantic zoom: overview (modules) -> function-level (call graph) -> intra-function (control flow)
- LLM-generated business summaries and edge labels (optional, docstrings as baseline)
- Path tracing, filtering, breadcrumb navigation

## Phasing Principles

1. **Ariadne leads** -- UI cannot render control flow data that doesn't exist. Ariadne changes land first, published as a new minor version, then consumed by Code Charter.
2. **Each phase ships value** -- no pure-plumbing phases. Every phase changes what the user sees.
3. **Hardest risks early** -- intra-function CFG extraction and the new node type rendering are the two biggest unknowns; they appear in phases 1 and 2.
4. **Backwards compatible at every step** -- the existing call graph view continues to work. New features are additive.
5. **Parallel tracks where possible** -- UI polish work is independent of ariadne extraction work.

---

## Phase 1: Control Flow Block Annotations in Ariadne

**Goal:** Ariadne's scope tree distinguishes block kinds and carries condition text, enabling Code Charter to know _what kind_ of block each scope is.

**What changes:**

| Package            | Change                                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ariadnejs/types` | Add `BlockKind` discriminant (`if`, `else`, `for`, `while`, `do_while`, `try`, `catch`, `finally`, `switch`, `switch_case`) to `LexicalScope`. Add optional `condition_text: string` field. Add optional `sibling_scope_ids: ScopeId[]` for linking if/else and try/catch branches.           |
| `@ariadnejs/core`  | Update tree-sitter `.scm` queries to capture block kind from the AST node type. Update `process_scopes()` in `scopes.ts` to populate `block_kind`, `condition_text` (extracted from the condition child node), and `sibling_scope_ids`. Implement for TypeScript first, then Python and Rust. |
| `@ariadnejs/core`  | Add tests for each block kind across TypeScript, Python, and Rust.                                                                                                                                                                                                                            |

**Dependencies:** None (first phase).

**What the user sees:** Nothing yet in Code Charter -- this is ariadne-only. However, the ariadne test suite proves the data is correct, and Code Charter can start consuming it immediately in Phase 2.

**Effort:** Medium. The scope extraction machinery exists; this extends it with richer annotations. The tree-sitter queries already capture `if_statement`, `for_statement`, etc. -- the work is mapping node types to `BlockKind` and extracting condition child nodes.

**Parallelism:** Phase 1 ariadne work and Phase 2 UI scaffolding (node type components, edge type components) can start in parallel since the UI work uses mock data initially.

---

## Phase 2: Flowchart Node Types and Edge Labels in the UI

**Goal:** The UI gains decision (diamond), loop (hexagon), and process (rectangle) node shapes, plus labeled/typed edges. The call graph view is enhanced with edge labels showing call relationships more clearly.

**What changes:**

| Package               | Change                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@code-charter/types` | Add `FlowchartNodeKind` enum (`process`, `decision`, `loop`, `io`, `entry`, `exit`). Add `FlowchartEdgeKind` enum (`control`, `data`, `error`, `call`). Extend `CodeChartEdge` with optional `label` and `edge_kind` fields. |
| `@code-charter/ui`    | Create new React Flow custom node components: `DecisionNode` (diamond via CSS rotation or SVG), `LoopNode` (hexagon), `IONode` (parallelogram). Register in `zoomAwareNodeTypes`.                                            |
| `@code-charter/ui`    | Create custom edge component with label rendering and edge-kind-based styling (dashed for error, bold for control, thin for data).                                                                                           |
| `@code-charter/ui`    | Update `chart_types.ts` with new discriminated node type unions. Update `call_tree_to_graph.ts` to accept optional control flow data and generate the appropriate node types.                                                |
| `@code-charter/ui`    | Update ELK layout options in `graph_layout.ts` -- decision nodes need different aspect ratios; loop containers may need special padding.                                                                                     |

**Dependencies:** Types from Phase 1 inform what data is available, but the UI components can be built and tested with mock/hardcoded data before the ariadne integration lands.

**What the user sees:** The existing call graph renders with the same functionality, but edges now have subtle "call" labels. The new node shapes are registered but not yet populated from real data (they appear when Phase 3 wires the data through).

**Effort:** Medium-Large. Multiple new React components, custom edge rendering, layout adjustments, and comprehensive visual testing.

**Parallelism:** Can run in parallel with Phase 1 ariadne work. The UI team builds against mock data / fixture files.

---

## Phase 3: Intra-Function CFG Construction and Wiring

**Goal:** Ariadne builds intra-function control flow graphs from the annotated scope tree + call references. Code Charter consumes this data and renders flowchart views for individual functions.

**What changes:**

| Package                | Change                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@ariadnejs/types`     | Define `ControlFlowGraph` type: `{ blocks: CFGBlock[], edges: CFGEdge[] }`. `CFGBlock` has `id`, `kind` (from `BlockKind`), `scope_id`, `condition_text`, `calls: CallReference[]`. `CFGEdge` has `source_block_id`, `target_block_id`, `label` (e.g., "true"/"false"/"catch"/"finally"), `edge_kind`.         |
| `@ariadnejs/core`      | New module `build_cfg.ts` in `trace_call_graph/`: walks a function's child scopes, creates CFG blocks for each block-kind scope, connects them with edges based on sibling relationships (if->else, try->catch->finally) and sequential flow. Each block references the `CallReference`s that occur within it. |
| `@ariadnejs/types`     | Extend `CallableNode` with optional `cfg: ControlFlowGraph` field.                                                                                                                                                                                                                                             |
| `@ariadnejs/core`      | Update `trace_call_graph.ts` to populate CFGs on each `CallableNode`.                                                                                                                                                                                                                                          |
| `@code-charter/types`  | Re-export new ariadne CFG types.                                                                                                                                                                                                                                                                               |
| `@code-charter/vscode` | Update `extract_descriptions` and the `getCodeTreeDescriptions` command to pass CFG data through to the UI.                                                                                                                                                                                                    |
| `@code-charter/ui`     | Update `call_tree_to_graph.ts`: when a function node is "expanded" (or at sufficient zoom), render its CFG blocks as child nodes using the Phase 2 node types. Map `CFGEdge` labels to the UI edge labels.                                                                                                     |

**Dependencies:** Phase 1 (block annotations) and Phase 2 (UI node types).

**What the user sees:** Clicking or zooming into a function node reveals its internal control flow as a flowchart -- if/else diamonds with true/false edges, loop hexagons, try/catch error paths. This is the core "aha" moment of the evolution.

**Effort:** Large. The CFG builder is the most algorithmically complex piece. Mapping scope trees to proper CFG edges (especially for nested if/else chains, early returns, and exception flow) requires careful design and thorough testing.

**Parallelism:** None -- this is the critical path. Depends on both Phase 1 and Phase 2.

---

## Phase 4: Semantic Zoom with Three-Tier Navigation

**Goal:** Implement a cohesive three-tier zoom experience: Module overview -> Function call graph -> Intra-function flowchart, with breadcrumb navigation and smooth transitions.

**What changes:**

| Package            | Change                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@code-charter/ui` | Implement breadcrumb navigation component showing the current zoom context (Module > Function > Block). Clicking breadcrumbs navigates up the hierarchy. |
| `@code-charter/ui` | Implement drill-down interaction: double-click a module to see its functions; double-click a function to see its CFG. Back button / breadcrumb to go up. |
| `@code-charter/ui` | Refactor zoom threshold logic from the current two-tier system (zoomed-in/zoomed-out) to three tiers with configurable thresholds in `chart_config.ts`.  |
| `@code-charter/ui` | Add path tracing: clicking a node dims all non-connected nodes and highlights the execution path through it.                                             |
| `@code-charter/ui` | Add navigation history (back/forward) stored in component state.                                                                                         |

**Dependencies:** Phase 3 (CFG data must be renderable).

**What the user sees:** A polished, multi-level exploration experience. The user starts at the module/cluster overview, drills into a function's call graph, then into a specific function's control flow. Breadcrumbs show where they are. Path highlighting helps trace execution flow.

**Effort:** Medium. The rendering infrastructure exists from prior phases. This is interaction design and state management work.

**Parallelism:** The breadcrumb component and navigation history can be prototyped during Phase 3 development using the existing two-tier zoom as a starting point.

---

## Phase 5: Data Flow Annotations (Arguments, Returns, Edge Labels)

**Goal:** Edges carry data flow information -- what arguments are passed at call sites, what values are returned, and how data flows through decision branches.

**What changes:**

| Package            | Change                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@ariadnejs/types` | Extend `CallReference` with optional `argument_texts: string[]` (source text of each argument) and `return_usage: string` (how the return value is used, e.g., variable name or inline).   |
| `@ariadnejs/core`  | In the reference extraction phase, capture argument AST nodes' text and the assignment target of call expressions. This extends the existing `CallInfo` extraction in `index_single_file`. |
| `@code-charter/ui` | Render argument labels on call edges (e.g., `(user, config)`). Render return value annotations.                                                                                            |
| `@code-charter/ui` | Add data flow edge type (thin, colored differently from control flow edges) for variable dependencies across blocks.                                                                       |

**Dependencies:** Phase 3 (CFG must exist for intra-function data flow to make sense on the diagram).

**What the user sees:** Edges between function nodes show argument summaries. Edges within a function's flowchart show what data flows between blocks. The user can understand not just _what_ is called but _with what data_.

**Effort:** Medium. Argument text extraction from tree-sitter is straightforward. The UI label rendering builds on Phase 2's edge label infrastructure.

**Parallelism:** The ariadne argument extraction work can start during Phase 3 or Phase 4 since it's independent of CFG construction.

---

## Phase 6: LLM-Enhanced Summaries and Classification

**Goal:** Optional LLM integration generates business-level summaries for functions, clusters, and edges, upgrading the experience from code-level to business-level understanding.

**What changes:**

| Package                | Change                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@code-charter/vscode` | Integrate with VSCode Language Model API (`vscode.lm`) as the primary LLM provider. Define prompt templates for: function role classification, business summary generation, edge label generation, cluster narrative generation.              |
| `@code-charter/vscode` | Add a new command `generateBusinessSummaries` that takes a call tree + CFGs and returns enriched descriptions. Implement as a batch operation with progress reporting.                                                                        |
| `@code-charter/types`  | Extend `DocstringSummaries` (or create a new `BusinessSummaries` type) with `role: FunctionRole` (e.g., "validation", "transformation", "io", "orchestration"), `business_summary: string`, and `edge_labels: Record<string, string>`.        |
| `@code-charter/ui`     | Display business summaries in node tooltips or expanded views. Show function role as a badge/icon on nodes. Use LLM-generated edge labels when available, falling back to argument-based labels from Phase 5.                                 |
| `@code-charter/vscode` | Heuristic-first classification: before calling the LLM, classify functions by naming patterns and call patterns (e.g., functions starting with `validate*` are "validation", functions doing only I/O calls are "io"). LLM refines/overrides. |

**Dependencies:** Phase 5 (data flow annotations provide context for LLM prompts). Phase 3 (CFGs provide structure for LLM to reason about).

**What the user sees:** Functions show business-level summaries ("Validates user input and returns sanitized data") instead of raw docstrings. Nodes have role badges. Cluster narratives describe what each module does in business terms. This works without an LLM (heuristic fallback) but is much richer with one.

**Effort:** Medium-Large. The LLM integration is moderate, but prompt engineering for good summaries across different codebases requires iteration. The heuristic classifier is straightforward.

**Parallelism:** Heuristic classification can be developed independently at any point after Phase 3. LLM integration requires the VSCode Language Model API, which is independent of the UI work.

---

## Phase 7: Interaction Polish and Export

**Goal:** Final interaction features that complete the flowchart viewer experience: filtering, annotations, source preview, and image export.

**What changes:**

| Package            | Change                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@code-charter/ui` | Category-based filtering: filter nodes by role (from Phase 6), by module, by file path. Filter panel in sidebar.                                                                             |
| `@code-charter/ui` | Source code preview: hovering or selecting a node shows a code snippet preview panel (read-only). Uses the existing `navigateToDoc` infrastructure but renders inline instead of navigating. |
| `@code-charter/ui` | Image/SVG export: export the current view as PNG or SVG for documentation. Use React Flow's built-in `toObject()` + html-to-image or similar.                                                |
| `@code-charter/ui` | User annotations: allow users to add sticky notes to the diagram that persist across sessions (stored in `.code-charter/` workspace folder).                                                 |

**Dependencies:** Phase 4 (navigation), Phase 6 (role classification for filtering). However, source preview and export can start after Phase 3.

**What the user sees:** A complete, polished tool for understanding codebases. Filtering narrows the view to relevant parts. Source preview provides immediate context. Export creates shareable documentation artifacts.

**Effort:** Medium. Each feature is relatively independent and well-scoped.

**Parallelism:** All four features (filtering, source preview, export, annotations) are independent of each other and can be developed in parallel.

---

## Phase Dependency Graph

```
Phase 1 (Ariadne block annotations)  ──┐
                                        ├──> Phase 3 (CFG construction + wiring)
Phase 2 (UI node/edge types)  ─────────┘          │
                                                   ├──> Phase 4 (Semantic zoom + navigation)
                                                   │          │
                                                   │          ├──> Phase 7 (Polish + export)
                                                   │          │
Phase 5 (Data flow annotations)  ──────────────────┘          │
   (ariadne work can start during Phase 3)                    │
                                                              ├──> Phase 6 (LLM summaries)
                                                              │
                                                              └──> Phase 7 (Polish + export)
```

**Parallel execution opportunities:**

- Phases 1 and 2 run fully in parallel (ariadne vs UI, no dependencies)
- Phase 5 ariadne-side argument extraction can start during Phase 3 or 4
- Phase 6 heuristic classification can start any time after Phase 3
- Phase 7 features are all independent of each other

## Effort Summary

| Phase                          | Relative Effort | Key Risk                                                          |
| ------------------------------ | --------------- | ----------------------------------------------------------------- |
| 1. Block annotations (ariadne) | Medium          | Correct condition text extraction across languages                |
| 2. UI node/edge types          | Medium-Large    | Diamond/hexagon rendering + ELK layout compatibility              |
| 3. CFG construction + wiring   | Large           | Algorithmic correctness of CFG edges for nested/early-return flow |
| 4. Semantic zoom + navigation  | Medium          | Smooth transitions between three zoom tiers                       |
| 5. Data flow annotations       | Medium          | Argument text extraction fidelity                                 |
| 6. LLM summaries               | Medium-Large    | Prompt quality and LLM availability/cost                          |
| 7. Interaction polish          | Medium          | Incremental; lowest risk                                          |

## Task Decomposition Guidance

When creating backlog tasks from these phases:

- **Phase 1** splits into: (a) types changes, (b) TypeScript scope extraction, (c) Python scope extraction, (d) Rust scope extraction -- each is a PR
- **Phase 2** splits into: (a) types + diamond node component, (b) hexagon + IO node components, (c) custom edge component with labels, (d) ELK layout adjustments -- each is a PR
- **Phase 3** splits into: (a) CFG types, (b) CFG builder for sequential + conditional flow, (c) CFG builder for loops + exceptions, (d) wiring through vscode backend, (e) UI rendering of expanded CFGs -- aim for 2-3 PRs
- **Phase 4** splits into: (a) breadcrumb component, (b) three-tier zoom refactor, (c) drill-down interaction, (d) path tracing, (e) navigation history -- each is a PR
- **Phase 5** splits into: (a) ariadne argument/return extraction, (b) UI data flow edge rendering -- 2 PRs
- **Phase 6** splits into: (a) heuristic classifier, (b) VSCode LM API integration, (c) prompt templates + batch summarization, (d) UI role badges + summary display -- 3-4 PRs
- **Phase 7** splits into: (a) filtering panel, (b) source preview, (c) image export, (d) annotations -- each is a PR
