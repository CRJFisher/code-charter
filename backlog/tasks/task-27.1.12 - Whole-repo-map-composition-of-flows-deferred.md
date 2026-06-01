---
id: TASK-27.1.12
title: "Whole-repo zoomable map: composition of flows over the file/dir scaffold (deferred)"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - ui
  - graph-db
  - flows
  - deferred
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.3
  - task-27.1.11
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Deferred — the post-v1 realization of doc-5's "one zoomable map".** v1 surfaces flows one-at-a-time via the selector (task-27.1.3); this task composes those flows into a single whole-repo zoomable map, closing the gap to the doc-5 vision.

The whole repo as one connected, budget-capped, N-tier zoomable map — built by **tiling the v1 flows over the deterministic file/directory scaffold** and folding with the budget-driven level-projection transform. This is the former 27.1.4 N-tier-zoom work, deferred: a flow is the tiling block, so the map is their composition, not a from-scratch clustering of the repo.

The **level-projection seam is preserved** in the v1 render (task-27.1.3 renders one flow as a single containment-source view), so this task returns through the same `render()`/transform without a signature change — it adds the multi-flow composition + N-tier zoom on top.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

> High-level; deferred until the v1 flow experience is proven and the composition is warranted.

- [ ] #1 The whole repo renders as one connected diagram with a dynamic number of budget-capped zoom levels, composed from the v1 flows over the file/dir scaffold (clustering an optional refinement only where a tier overflows — task-27.1.11)
- [ ] #2 The budget-driven level-projection transform dispatches on containment source (file/dir scaffold, flow tiling, optional clusters) under one `active_level` knob — no `render()` signature change, no parallel render stack
- [ ] #3 Drill between the whole-repo map and a single flow is continuous (a flow is a sub-view of the map, not a separate surface)
- [ ] #4 Each rendered level stays within the per-view legibility budget

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-ZOOMED-OUT-ORGANIZER — is the most-zoomed-out tier organized by containment (file/dir + flow tiling), by flow (top-level golden paths), or both as toggleable lenses?** Carried forward from the flow reframe; resolve when this composition is built.
- **D-DOC5-FORM — how doc-5's "one zoomable map" section is reconciled** (annotation vs vision/v1-addendum split).

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
