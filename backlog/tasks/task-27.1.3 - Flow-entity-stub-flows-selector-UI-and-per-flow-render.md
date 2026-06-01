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

- [ ] #1 A flow persists as an `agentic.flow` group `NodeRow` (open `kind`, `layer='agentic'`) carrying `{label, entry_points, exit_points, rationale}` in its attribute bag, with `agentic.contains` edges to members and `agentic.inferred` edges for cross-call-graph bridges — riding task-27.0's open `kind`/attributes with **no schema migration**
- [ ] #2 **Subgraph-induced membership:** flow membership is the subgraph induced by seed entrypoint roots + bridge edges + linked docs; each seeded tree's interior comes from the deterministic call-graph (the flow stores the seeds/bridges/docs, not an enumerated leaf set)
- [ ] #3 **Deterministic stub flow set:** before any agent runs, one flow per top-level entrypoint's reachable call-graph + its literal doc edges is generated (reusing the existing `detect_entry_points` / `call_graph.entry_points` substrate), so the selector + per-flow render are demoable immediately
- [ ] #4 **Flow identity is stable** across code change and a non-deterministic re-detection: identity reuses the cluster-node-identity slice (canonical hash of the sorted member-anchor set + ≥50% overlap remap, extracted from the deferred clustering task) so a user rename/pin survives a skill-A re-run; split/merge surfaces both successors in the re-attachment bin (task-27.1.6)
- [ ] #5 The **left-panel flow selector replaces the entrypoint list**: `side_bar.tsx`'s entry-points path and the `cluster_code_tree(top_level_symbol)` backend contract are **deleted (no shim)** and replaced by a flow-keyed surface (`list_flows()` / `render_flow(flow_id)`); entrypoint **detection** is retained as substrate. The list is navigable when many flows exist (ranking/grouping/cap is **D-FLOW-LIST-LEGIBILITY**, open)
- [ ] #6 Selecting a flow renders **one bounded subgraph** via the task-27.1.2 `CustomGraph`→React Flow adapter + position-preserving layout, folded only by the deterministic file/dir scaffold if it exceeds a per-view legibility budget (large-flow handling is **D-LARGE-FLOW-RENDER**, open)
- [ ] #7 On open, the top-ranked flow is auto-selected and rendered (the decided landing view)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-FLOW-LIST-LEGIBILITY — how is the flow list made navigable (count, ranking, grouping, naming) and cost-bounded?** Options: flat ranked list (size/centrality) · grouped under the file/dir scaffold · capped top-N + "more" · agent-named + user-reorderable (user-tier). _Stake:_ the list IS the comprehension surface; a 40-item wall fails "essence" as badly as the old entrypoint list.
- **D-LARGE-FLOW-RENDER — how is a large flow rendered?** Options: file/dir scaffold fold only · per-view legibility budget with directory collapse · minimal flow-internal chunking now (risks dragging in deferred clustering). _Stake:_ how much of the deferred level-projection seam (task-27.1.12) must ship vs merely be reserved.
- **D-FLOW-IDENTITY — exact identity mechanism** (reuse cluster anchor-set hash + remap is the lead; alternatives: anchor to dominant seed entrypoint · stable user slug once named). _Stake:_ if identity churns, the selector reshuffles and per-flow drift loses its anchor.

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
