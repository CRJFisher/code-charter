---
id: TASK-27.1.3
title: "Flow entity, deterministic stub flows, flow selector UI, and per-flow render"
status: Done
assignee: []
created_date: "2026-06-01"
labels:
  - architecture
  - graph-db
  - ui
  - flows
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.2
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The v1 unit of comprehension: a **flow** — a functionality umbrella that links one or more Ariadne call-graphs together with documentation. This task defines the flow as a first-class entity, ships a **deterministic stub flow set** so the UI works before the agentic detector lands, and replaces the entrypoint list with a **left-panel flow selector** whose selected flow renders as its own connected diagram.

A flow is the first inhabitant of the agentic tier and the **tiling block** of the eventual whole-repo map (task-27.1.12): surfacing flows one-at-a-time is the v1 path toward doc-5's "one zoomable map", not a divergence from it.

**Membership is subgraph-induced (decided):** a flow = the subgraph induced by `{seed entrypoint roots} + {agent-inferred bridge edges across those trees} + {linked doc nodes}`, with the deterministic call-graph supplying each seeded tree's interior **for free**. The agent (task-27.1.6) judges only cross-tree linkage and doc attachment — it never enumerates intra-tree members. This task ships the _container_ + a deterministic stub population; task-27.1.6 swaps in the agentic boundary.

**Landing view (decided):** the left panel lists flows ordered **hydrated-first** — flows whose code has been worked on (and therefore have an agentic diagram) come first, then by recency of update — followed by the browsable deterministic skeleton for the rest of the tree. On open, the top entry is auto-selected and rendered: if a hydrated flow exists it renders its agentic diagram; otherwise the deterministic skeleton (Ariadne call-graph + file scaffold) renders, so a cold repo still shows structure without a click. Agentic diagrams are never built whole-repo upfront; a flow's agentic diagram is hydrated lazily and piecemeal the first time its code is worked on (task-27.1.6's Stop-hook sub-agent).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A flow persists as an `agentic.flow` group `NodeRow` (open `kind`, `layer='agentic'`) carrying `{label, entry_points, exit_points, rationale}` in its attribute bag, with `agentic.flow_member` edges to its seed roots + linked docs and `agentic.bridge` edges for cross-call-graph links — riding task-27.0's open `kind`/attributes with **no schema migration**. (Distinct from the deterministic file-module grouping in task-27.1.2, which uses its own raw-tier `kind` — `agentic.contains` is **not** overloaded across the two.)
- [ ] #2 **Subgraph-induced membership:** flow membership is the subgraph induced by seed entrypoint roots + bridge edges + linked docs; each seeded tree's interior comes from the deterministic call-graph (the flow stores the seeds/bridges/docs, not an enumerated leaf set). "Which flow does leaf L belong to" is computed by re-inducing each flow's subgraph, not by a containment tree-walk
- [ ] #3 **Deterministic skeleton (whole-repo, always browsable):** one deterministic flow per top-level entrypoint's reachable call-graph + its literal doc edges is generated from Ariadne's `call_graph.entry_points`. This skeleton is the permanent whole-repo browsable substrate — cheap, deterministic, never gated on an agent — not a temporary placeholder. A skeleton flow renders its call-graph + file scaffold immediately. Agentic enrichment (boundary, label, bridge edges, descriptions) is layered on lazily per flow when that flow's code is first worked on (task-27.1.6), upgrading the skeleton flow in place.
- [ ] #4 **Flow identity (v1 = dominant seed-entrypoint anchor):** a flow's stable id is the anchor of its dominant seed entrypoint — deterministic, simple, and stable across code change (the resolver re-anchors it through a rename/move). This is net-new but trivial; the heavier sorted-anchor-set hash + ≥50% overlap remap is **deferred** until the flow-detection agent (task-27.1.6) produces non-deterministic re-detection that actually churns membership (resolve **D-FLOW-IDENTITY** there, not here). A split/merge that strands a user-given name surfaces in the re-attachment bin (task-27.1.6)
- [ ] #5 The **left-panel flow selector replaces the entrypoint list**: `side_bar.tsx`'s entry-points path and the `cluster_code_tree(top_level_function_symbol)` backend contract are **deleted (no shim)**, along with the deletion ripple this forces — `get_code_tree_descriptions`, the per-entrypoint description fetch in `app.tsx`, and the `CodeCharterBackend`/`mock_backend`/`vscode_backend` methods for them — replaced by a flow-keyed surface (`list_flows()` / `render_flow(flow_id)`); descriptions now render from the store via `render(layers)`, not an async per-entrypoint fetch. Entrypoint **detection** (`call_graph.entry_points`) is retained as substrate
- [ ] #6 Selecting a flow renders **one bounded subgraph** via the task-27.1.2 `CustomGraph`→React Flow adapter + position-preserving layout, folded by the deterministic file-module scaffold to stay within a pinned **per-view node+edge budget** if the flow is large (deeper large-flow handling is **D-LARGE-FLOW-RENDER**, open)
- [ ] #7 The flow list is ordered **hydrated-first, then by recency**: flows that have an agentic diagram (their code has been worked on) appear first, ordered by most-recently-updated; the deterministic skeleton flows that have not yet been hydrated follow. On open, the top entry is auto-selected and rendered. The list is **capped to a top-N with a 'more' affordance**. The hydrated flag is `EXISTS(agentic.flow node)` for the flow; recency is the flow node's `attributes.last_synced_at` (no schema migration — see D-FLOW-RECENCY). Richer secondary ranking/grouping is **D-FLOW-LIST-LEGIBILITY** (open).
- [ ] #8 **Un-flowed code is not invisible:** code reachable from no entrypoint (library-only, dead code, test helpers, registration-only handlers) is bucketed into a single deterministic, selectable **`unattributed` flow** within the deterministic skeleton, so the **skeleton** covers the whole tree and that code is always browsable. Like every flow, the `unattributed` bucket's agentic diagram is hydrated lazily — the first time that code is worked on, the Stop-hook sub-agent (task-27.1.6) hydrates it; it is not enriched eagerly.

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-FLOW-LIST-LEGIBILITY — how is the flow list made navigable (count, ranking, grouping, naming) and cost-bounded?** Options: flat ranked list (size/centrality) · grouped under the file/dir scaffold · capped top-N + "more" · agent-named + user-reorderable (user-tier). _Stake:_ the list IS the comprehension surface; a 40-item wall fails "essence" as badly as the old entrypoint list. _(Primary ordering is decided: hydrated-first, then recency — AC#7. This decision now covers only secondary navigability: grouping, naming, capping, and the 'more' affordance.)_
- **D-LARGE-FLOW-RENDER — how is a large flow rendered?** Options: file/dir scaffold fold only · per-view legibility budget with directory collapse · minimal flow-internal chunking now (risks dragging in deferred clustering). _Stake:_ how much of the deferred level-projection seam (task-27.1.12) must ship vs merely be reserved.
- **D-FLOW-IDENTITY (v1 resolved: dominant seed-entrypoint anchor).** The full sorted-anchor-set hash + ≥50% overlap remap is deferred to task-27.1.6 (only needed once non-deterministic re-detection churns membership). Re-open there if the dominant-seed anchor proves unstable under agent re-detection.
- **D-FLOW-RECENCY** — which timestamp defines flow recency and which writer stamps it. Migration-free options: `attributes.last_synced_at` on the `agentic.flow` node (recommended, stamped by task-27.1.6); `MAX(file_hashes.last_seen_at)` over the flow's source files; `anchor_resolution.resolved_at`. No schema migration under any option.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

## High-level summary

**Why this exists.** Task-27.1's comprehension unit is the **flow** — a functionality umbrella over one or more call-graph trees plus linked docs. v1 needs the flow to be a first-class entity and the left panel to select flows, not entrypoints, *before* the agentic flow-detector (task-27.1.6) exists. This task ships the flow **container**, a **deterministic stub population** so the UI is useful on a cold repo, and rewires the webview's render path onto the store-based adapter that task-27.1.2 built but left dormant.

**The approach and the load-bearing decision.** A flow's interior comes from Ariadne's call graph "for free"; only the cross-tree seam and doc attachment are agentic (task-27.1.6). So v1 **does not persist or enrich** skeleton flows: `render_flow(flow_id)` projects the selected entrypoint's reachable subgraph straight from the in-memory `CallGraph` (already served by the extension) into `NodeRow`/`EdgeRow` rows, folds in the file-module scaffold, and hands them to `custom_graph_to_react_flow`. Persisted `agentic.flow` nodes are reserved for *hydrated* flows that task-27.1.6 will write; `list_flows` reads them from the store and merges them ahead of the deterministic skeleton. This deliberately avoids building an Ariadne→SQLite raw-extraction pipeline now (it belongs with hydration, not the deterministic substrate) — the constitution's YAGNI line.

A second decision shapes flow identity (AC#4): the id is the dominant seed entrypoint's **`symbol_path`** — the location-free, body-independent half of its anchor — **not** the full `symbol_path:content_hash`. A content hash changes on every body edit, which would re-key the flow (and its persisted selection/layout) on every save; the `symbol_path` is the stable half a rename relocates and the resolver re-anchors. Skeleton flows are recomputed each session, so they re-derive their id deterministically and need no stored anchor; the full sorted-anchor-set hash + ≥50% overlap remap stays deferred to task-27.1.6 (D-FLOW-IDENTITY).

**What changed, at altitude.**

- **core** gains the flow model in two files. `model/flow.ts` is the single source of flow truth: `build_skeleton_flows` (one deterministic flow per `call_graph.entry_points` root, size-ranked, plus a single `unattributed` bucket for code reachable from no entrypoint), `flow_id_of` (identity), `reachable_from` (cycle-guarded forward traversal), `induce_members`/`flow_of_leaf` (subgraph-induced, set-valued membership — never a stored leaf set), `order_flows`/`read_hydrated_flows`/`skeleton_to_summary` (the AC#7 hydrated-first-then-recency merge), and the `agentic.flow`/`agentic.flow_member`/`agentic.bridge` row builders task-27.1.6 will persist. `model/flow_projection.ts` is the render path: `project_flow` re-induces the subgraph, synthesizes `code.function`/`code.calls` rows, folds them with `build_module_scaffold` via the new path-keyed `path_module_resolver`, and bounds the view to a pinned `DEFAULT_FLOW_BUDGET`, collapsing to module granularity when over budget.
- **types** swaps the backend contract: `cluster_code_tree` / `get_code_tree_descriptions` → `list_flows()` / `render_flow(flow_id)`, with the new `FlowSummary` and `RenderedRows` shapes in `flows.ts`. `NodeGroup`, `DocstringSummaries`, and the `clustering`/`storage` type modules are deleted.
- **ui** replaces the sidebar's entrypoint list with a flow selector (`side_bar.tsx`: renders the pre-ordered `FlowSummary[]`, caps to a top-N with a "more" reveal, navigates to the seed on click); `app.tsx` loads flows once and auto-selects the top, reconciling a selection the list no longer contains; `code_chart_area.tsx` switches its render effect from the `CallableNode` pipeline onto `render_flow` → `custom_graph_to_react_flow` → position-preserving layout, keyed by `flow_id`, with a single `FlowRenderStatus` lifecycle (the two-stage `DescriptionStatus` is removed) and a terminal empty state for a flow-less project.
- **vscode** replaces the two old handlers (and the clustering/embeddings machinery) with `list_flows` / `render_flow` computed from the in-memory call graph via `ensure_call_graph`, merging any hydrated `agentic.flow` nodes read from `.code-charter/graph.db` when it exists; `get_call_graph` and `navigate_to_doc` stay. The flow surface is a per-request snapshot — live re-sync is task-27.1.6's Stop-hook hydration, not a webview push.
- **deletions (no shim)**: `call_tree_to_graph.ts` (the `CallableNode` pipeline), the entire `packages/vscode/src/clustering` subsystem, `json_store.ts`, the orphaned `shared/codeGraph.ts`, and the clustering deps + config keys in `packages/vscode/package.json`.

**How to navigate the result.** Start at `packages/core/src/model/flow.ts` (the entity, identity, membership, ordering) and its sibling `flow_projection.ts` (subgraph → rows → scaffold fold → budget) — host-agnostic and unit-tested in `flow.test.ts` / `flow_projection.test.ts`. The backend contract (`packages/types/src/backend.ts` + `flows.ts`) is the seam; the UI flow selector (`side_bar.tsx`) and `code_chart_area.tsx`'s render effect are the front door on screen; the extension's `render_flow`/`list_flows` handlers are where the call graph becomes rows.

**What to know / watch.**

- The view is a **per-request snapshot**: a code change is picked up on the next selection, not pushed live. Saved layouts use a single persisted slot matched by `flow_id` (opening another flow overwrites it; per-flow persistence is not a v1 goal).
- **Deferred to task-27.1.6**: persisting/enriching `agentic.flow` nodes; `render_flow` dispatching on a hydrated-flow id (today it only resolves skeleton ids); carrying a hydrated summary's `seed_location`/live `member_count`; and live re-sync via the Stop hook.
- **Open decisions**, marked in code where it stops short: large-flow rendering beyond the single-level module collapse is **D-LARGE-FLOW-RENDER**; flow-list secondary navigability (grouping/naming/ranking) is **D-FLOW-LIST-LEGIBILITY**; rename/move-stable identity remap is **D-FLOW-IDENTITY**. Two same-named method entrypoints collapse to one id under the v1 enclosing-free `symbol_path` and are de-duplicated in the selector.
- Clustering returns later, from scratch, for a different purpose (chunking input + refactoring signal) in task-27.1.11.
- The removed clustering deps (`@tensorflow/tfjs-node`, `@huggingface/transformers`, `clustering-tfjs`) are dropped from `packages/vscode/package.json`; the root lockfile must be regenerated on the next install to prune their subtrees.
