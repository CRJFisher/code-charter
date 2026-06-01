---
id: TASK-27.1.3
title: "Flow entity, deterministic stub flows, flow selector UI, and per-flow render"
status: To Do
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

**Membership is subgraph-induced (decided):** a flow = the subgraph induced by `{seed entrypoint roots} + {agent-inferred bridge edges across those trees} + {linked doc nodes}`, with the deterministic call-graph supplying each seeded tree's interior **for free**. The agent (task-27.1.5) judges only cross-tree linkage and doc attachment — it never enumerates intra-tree members. This task ships the _container_ + a deterministic stub population; task-27.1.5 swaps in the agentic boundary.

**Landing view (decided):** on open, **auto-select and render the top-ranked flow** (the list on the left), so a cold repo shows essence without a click.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A flow persists as an `agentic.flow` group `NodeRow` (open `kind`, `layer='agentic'`) carrying `{label, entry_points, exit_points, rationale}` in its attribute bag, with `agentic.flow_member` edges to its seed roots + linked docs and `agentic.bridge` edges for cross-call-graph links — riding task-27.0's open `kind`/attributes with **no schema migration**. (Distinct from the deterministic file-module grouping in task-27.1.2, which uses its own raw-tier `kind` — `agentic.contains` is **not** overloaded across the two.)
- [ ] #2 **Subgraph-induced membership:** flow membership is the subgraph induced by seed entrypoint roots + bridge edges + linked docs; each seeded tree's interior comes from the deterministic call-graph (the flow stores the seeds/bridges/docs, not an enumerated leaf set). "Which flow does leaf L belong to" is computed by re-inducing each flow's subgraph, not by a containment tree-walk
- [ ] #3 **Deterministic stub flow set:** before any agent runs, one flow per top-level entrypoint's reachable call-graph + its literal doc edges is generated from Ariadne's `call_graph.entry_points`, so the selector + per-flow render are demoable immediately
- [ ] #4 **Flow identity (v1 = dominant seed-entrypoint anchor):** a flow's stable id is the anchor of its dominant seed entrypoint — deterministic, simple, and stable across code change (the resolver re-anchors it through a rename/move). This is net-new but trivial; the heavier sorted-anchor-set hash + ≥50% overlap remap is **deferred** until the flow-detection agent (task-27.1.5) produces non-deterministic re-detection that actually churns membership (resolve **D-FLOW-IDENTITY** there, not here). A split/merge that strands a user-given name surfaces in the re-attachment bin (task-27.1.6)
- [ ] #5 The **left-panel flow selector replaces the entrypoint list**: `side_bar.tsx`'s entry-points path and the `cluster_code_tree(top_level_function_symbol)` backend contract are **deleted (no shim)**, along with the deletion ripple this forces — `get_code_tree_descriptions`, the per-entrypoint description fetch in `app.tsx`, and the `CodeCharterBackend`/`mock_backend`/`vscode_backend` methods for them — replaced by a flow-keyed surface (`list_flows()` / `render_flow(flow_id)`); descriptions now render from the store via `render(layers)`, not an async per-entrypoint fetch. Entrypoint **detection** (`call_graph.entry_points`) is retained as substrate
- [ ] #6 Selecting a flow renders **one bounded subgraph** via the task-27.1.2 `CustomGraph`→React Flow adapter + position-preserving layout, folded by the deterministic file-module scaffold to stay within a pinned **per-view node+edge budget** if the flow is large (deeper large-flow handling is **D-LARGE-FLOW-RENDER**, open)
- [ ] #7 On open, the top-ranked flow is auto-selected and rendered. v1 ranking is a **deterministic default** (largest reachable call-graph by node count, tie-broken by entrypoint path); the flow list is **capped to a top-N with a "more" affordance** (richer ranking/grouping is **D-FLOW-LIST-LEGIBILITY**, open)
- [ ] #8 **Un-flowed code is not invisible:** code reachable from no entrypoint (library-only, dead code, test helpers, registration-only handlers) is bucketed into a single deterministic, selectable **`unattributed` flow** so the selector covers the whole tree and that code still gets auto-sync coverage (task-27.1.6)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-FLOW-LIST-LEGIBILITY — how is the flow list made navigable (count, ranking, grouping, naming) and cost-bounded?** Options: flat ranked list (size/centrality) · grouped under the file/dir scaffold · capped top-N + "more" · agent-named + user-reorderable (user-tier). _Stake:_ the list IS the comprehension surface; a 40-item wall fails "essence" as badly as the old entrypoint list.
- **D-LARGE-FLOW-RENDER — how is a large flow rendered?** Options: file/dir scaffold fold only · per-view legibility budget with directory collapse · minimal flow-internal chunking now (risks dragging in deferred clustering). _Stake:_ how much of the deferred level-projection seam (task-27.1.12) must ship vs merely be reserved.
- **D-FLOW-IDENTITY (v1 resolved: dominant seed-entrypoint anchor).** The full sorted-anchor-set hash + ≥50% overlap remap is deferred to task-27.1.5 (only needed once non-deterministic re-detection churns membership). Re-open there if the dominant-seed anchor proves unstable under agent re-detection.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
