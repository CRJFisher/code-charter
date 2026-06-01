---
id: TASK-27.1.4
title: "Budget-driven level-projection transform and N-tier zoom render"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - ui
  - graph-db
  - graphology
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.3
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The "one zoomable map" render primitive: a transform that projects the persisted containment hierarchy (task-27.1.3) to a single active level within the complexity budget, plus the UI generalization that turns the existing binary zoom into N discrete, legible levels.

The delivered UI zoom is a binary `ZoomMode` (`zoomedIn`/`zoomedOut`, single `0.45` threshold) with a two-branch node component. This task generalizes that to an emergent number of tiers driven by the hierarchy, leaving task-27.0.4's `render()` signature untouched.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A **level-projection transform** lives in `packages/core` alongside `render()`, with signature `(render_graph, active_level, dendrogram) → CustomGraph`: for the active level, clusters below the cut collapse to one group node, intra-cluster edges are dropped, and crossing edges are rerouted to the group-node boundary (`src`/`dst` replaced with the group id)
- [ ] #2 The `gaps_inside` count (inferred edges + orphan entrypoints inside a collapsed cluster) is rolled up onto the group node as an attribute for the UI to surface (feeding AC#3 of the parent)
- [ ] #3 The binary `ZoomMode` becomes `active_level: number` (0 = most-collapsed top tier, N-1 = leaf tier); the active level is derived from the React Flow zoom factor against N-1 evenly-spaced thresholds (or a persisted per-level zoom-floor when the user pins a band); a threshold crossing invokes the transform and replaces the React Flow nodes/edges
- [ ] #4 The `select_is_zoomed_out` selector and the two-branch `ZoomAwareNodeComponent`/`ModuleGroupNodeComponent` conditional are replaced with a level-aware equivalent; `render()`'s signature is unchanged
- [ ] #5 Each rendered level stays within `MAX_COMPLEXITY_PER_LEVEL` (legible text); the budget metric is pinned (node+edge count or ELK density score)
- [ ] #6 Drill-in/out reuses persisted tier assignment (task-27.1.3) and never re-clusters per interaction; re-render is content-hash-cached, not re-parse/re-cluster

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Implement the projection transform in `packages/core` next to `render()`, consuming task-27.1.3's `agentic.group`/`agentic.contains`.
2. Compute `gaps_inside` from the inferred-edge + orphan-entrypoint queries within each collapsed cluster.
3. In `packages/ui`, replace `ZoomMode` with `active_level`; map the React Flow zoom factor to a level; on crossing, run the transform and swap elements via the task-27.1.2 adapter (extended for `cluster` node type + `parentId`).
4. Pin the budget metric and the legible-text threshold; cache projected levels by content hash.
5. Tests: collapse/reroute correctness; `gaps_inside` roll-up; threshold→level mapping; each level within budget; no re-cluster on drill.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
