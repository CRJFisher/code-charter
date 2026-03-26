---
id: TASK-20
title: Evolve call graph visualization into business logic flowcharts
status: To Do
assignee: []
created_date: "2026-03-25 09:48"
labels:
  - flowchart
  - architecture
  - ariadne
  - ui
  - llm
dependencies: []
references:
  - backlog/docs/vision.md
  - backlog/docs/AI Code-to-Flowchart Generator.md
  - packages/ui/src/components/code_chart_area/call_tree_to_graph.ts
  - packages/ui/src/components/code_chart_area/chart_types.ts
  - packages/ui/src/components/code_chart_area/code_function_node.tsx
  - packages/ui/src/components/code_chart_area/graph_layout.ts
  - packages/vscode/src/extension.ts
  - packages/types/src/backend.ts
documentation:
  - backlog/docs/react-flow-implementation-guide.md
  - backlog/docs/visualisation-library-research.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Code Charter currently renders call graphs — function nodes connected by "calls" edges with docstring summaries, clustered into modules. The goal is to evolve towards **flowcharts** that surface the key control flow and data flow relevant to high-level business logic.

This task is the umbrella plan synthesized from deep research across 10 dimensions (control flow extraction, data flow tracking, flowchart UX design, React Flow capabilities, AST analysis, existing tools/research, abstraction levels, LLM-powered analysis, interactive exploration, and ariadne integration gaps) and 5 architectural planning sessions (ariadne extensions, UI flowchart rendering, LLM integration, interaction UX, overall phasing).

## Problem Statement

The current call graph says "A calls B" but a flowchart says "if condition, do X, otherwise do Y." The gap is:

- **No control flow context**: ariadne's `CallReference` has a `scope_id` but all block scopes are typed as generic `"block"` — the specific kind (if/for/while/try) and condition text are discarded
- **No edge labels**: edges carry no information about _why_ a function calls another
- **No visual distinction**: all functions are uniform rectangles regardless of their role (validation, data access, orchestration, error handling)
- **No data flow**: no tracking of what data flows between functions (parameters, return values)
- **Single abstraction level**: zoom toggles between module labels and full function detail, with no intermediate "flowchart" view

## Research-Validated Approach

**Academic validation**: The CodeMap study (2025) found that structured multi-level visualization powered by LLM summaries outperforms both raw LLM chat and static analysis tools for code comprehension — 79% less time reading LLM responses, 74% less time reading code directly. The gap Code Charter fills is "structural relationships + layered reasoning" that chat-based tools miss.

**Market gap**: The VSCode marketplace has call hierarchy visualizers (Chartographer) and intra-function flowcharts (CodeVisualizer), but nothing bridging cross-function control flow with business-logic abstraction. This is Code Charter's differentiator.

**Key architectural insight**: ariadne's tree-sitter queries already capture `if_statement`, `for_statement`, etc. as `@scope.block` — the block kind is right there in the tree-sitter node type but gets erased during scope processing. Preserving it (+ condition text + sibling branch tracking) enables flowchart rendering without new parsing infrastructure.

## Phased Implementation Plan

### Phase 1: Control Flow Block Annotations in Ariadne

**Repo**: ariadne | **Effort**: Small-Medium | **Dependencies**: None

Extend `LexicalScope` with three new fields:

- `block_kind: BlockKind | null` — preserves tree-sitter node type (`"if"`, `"for"`, `"while"`, `"try"`, `"catch"`, `"else"`, etc.)
- `condition_text: string | null` — extracted via `node.childForFieldName("condition")?.text`
- `sibling_scope_ids: readonly ScopeId[]` — links if/else_if/else and try/catch/finally as alternative branches

**Changes**: `@ariadnejs/types/src/scopes.ts` (add `BlockKind` type), `@ariadnejs/core/src/index_single_file/scopes/scopes.ts` (map tree-sitter node types to BlockKind during scope processing, extract condition text, post-process sibling linkage).

**Backwards compatible**: all new fields are null/empty for non-block scopes.

### Phase 2: Flowchart Node Types and Edge Labels in UI

**Repo**: code-charter | **Effort**: Medium | **Dependencies**: None (can run in parallel with Phase 1)

New React Flow node components:

- **Decision node** (diamond via CSS `clip-path`) with multiple Handle positions (`source-yes` right, `source-no` bottom)
- **I/O node** (parallelogram) for database/API/file operations
- **Loop node** (hexagon) for iteration

Plus:

- Custom `FlowEdge` component with labels (React Flow's `EdgeLabelRenderer`), kind-based styling (solid=control, dashed=data, red=error)
- Heuristic node classifier (`node_classifier.ts`) that assigns categories from function names + call patterns — no LLM required
- ELK port constraints (`FIXED_SIDE`) on decision nodes for proper branch routing
- Fix `unnecessaryBendpoints` from `'true'` to `'false'` for cleaner flowchart lines

### Phase 3: Intra-Function CFG Construction and Backend Wiring

**Repo**: ariadne + code-charter | **Effort**: Large | **Dependencies**: Phase 1 + Phase 2

**Critical path phase.** Build `IntraFunctionCfg` from ariadne's annotated scope tree:

- Group `CallableNode.enclosed_calls` by `scope_id`
- Create `BasicBlock`s (consecutive calls in same scope)
- Connect with typed `CfgEdge`s (sequential, conditional, loop_entry, loop_back, exception)
- Add optional `cfg?: IntraFunctionCfg` field to `CallableNode`

Wire through Code Charter:

- New `cfg_to_flowchart.ts` transforms `IntraFunctionCfg` into React Flow elements
- `generateReactFlowElements()` delegates to CFG renderer when `cfg` is present, falls back to flat call graph when absent
- New `getFlowGraph` backend command

### Phase 4: Three-Tier Semantic Zoom and Interactive Navigation

**Repo**: code-charter | **Effort**: Medium | **Dependencies**: Phase 3

Replace binary zoom (Module View / Function View) with three tiers:

- **Architecture** (zoom < 0.3): module groups only, inter-module edges, clean overview
- **Flow** (0.3–0.7): shaped function nodes with names, edge labels — the primary flowchart view
- **Detail** (> 0.7): full node content with descriptions

Plus interactive exploration:

- **Path tracing**: BFS-based highlighting of all paths to/from selected node, everything else dims to 15% opacity
- **Module drill-down**: double-click module to zoom in, breadcrumb navigation to go back
- **Navigation history**: Alt+Left/Right browser-like back/forward through exploration states
- **Category filtering**: toggle visibility by function role (business logic, data access, validation, error handling)

### Phase 5: Data Flow Annotations

**Repo**: ariadne + code-charter | **Effort**: Medium | **Dependencies**: Phase 3 (ariadne extraction can start during Phase 3)

Extend `CallReference` with:

- `argument_texts?: readonly string[]` — text of individual arguments at call sites
- New `DataFlowAnnotation` type with `ArgumentParameterMapping` and `ReturnValueUsage`

UI renders data flow on edges: parameter names/types as edge labels, dashed style for data-only edges. Function signatures (params + return type) displayed on nodes — all data already available from `FunctionDefinition.signature`.

### Phase 6: LLM-Enhanced Summaries (Optional/Progressive)

**Repo**: code-charter | **Effort**: Medium | **Dependencies**: Phase 2 (heuristic classifier)

Progressive enhancement — graph works without LLM, LLM adds richer labels:

- **Provider abstraction**: VSCode Language Model API (primary, zero config), Ollama fallback
- **Heuristic baseline** (Phase 2 classifier): name-pattern matching, structural graph analysis — delivers value with zero LLM dependency
- **LLM enrichment**: business-level function summaries, edge labels ("on success", "for each item"), cluster narratives, branch condition summarization
- **Caching**: per source-hash in `.code-charter/llm-analysis/`, leveraging existing `VscodeCacheStorage`
- **Batching**: 5-10 functions per prompt for latency amortization

### Phase 7: Interaction Polish and Export

**Repo**: code-charter | **Effort**: Small per feature | **Dependencies**: Phase 4

Independent features:

- **Image/SVG export** via `html-to-image`
- **User annotations** on nodes, persisted to graph state
- **Complexity indicators** (green/yellow/red dots by fan-out count)
- **Source code preview** (Ctrl+Click opens beside editor, not navigates away)
- **Hover tooltips** on zoomed-out nodes showing signature + description

## Parallelism Opportunities

- Phase 1 (ariadne) and Phase 2 (UI) are fully independent — work in parallel
- Phase 5 ariadne extraction (argument capture) is independent of CFG construction — can start during Phase 3
- Phase 6 LLM heuristic baseline is independent of ariadne work — can start anytime after Phase 2
- Phase 7 features are all independent of each other

## Key Technical Decisions

1. **CFG is intra-function only** — inter-function flow uses the existing call graph. Composable, not monolithic.
2. **All new ariadne fields are optional** — existing consumers unaffected. `block_kind: null`, `condition_text: null`, `cfg?: undefined`.
3. **Heuristic-first, LLM-optional** — the core flowchart experience requires zero LLM. LLMs add semantic richness.
4. **Static analysis for structure, LLM for meaning** — research confirms LLMs are poor at static analysis tasks but excellent at semantic summarization.
5. **No full CFG with SSA/phi nodes** — this is a visualization tool, not a compiler. Scope-tree-derived basic blocks are sufficient.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Functions in the call graph are rendered as shaped flowchart nodes (diamonds for decisions, parallelograms for I/O, hexagons for loops) based on heuristic classification
- [ ] #2 Edges between functions carry labels describing the relationship (e.g. 'on success', 'validates', 'for each item') via heuristic or LLM analysis
- [ ] #3 Ariadne preserves control flow block kind (if/else/for/while/try/catch) and condition text on LexicalScope so Code Charter can render conditional branches
- [ ] #4 When a function contains if/else or try/catch branches, the flowchart shows decision points with labeled branch edges rather than a flat list of callees
- [ ] #5 Three-tier semantic zoom provides Architecture view (modules only), Flow view (shaped nodes + edge labels), and Detail view (full descriptions)
- [ ] #6 Users can click a node to highlight all paths to/from it (path tracing) with non-participating nodes dimmed
- [ ] #7 Module drill-down with breadcrumb navigation allows exploring a module's internal flowchart
- [ ] #8 LLM-powered summaries are optional and progressive — the flowchart renders fully using heuristics alone, LLM enriches labels when available
<!-- AC:END -->
