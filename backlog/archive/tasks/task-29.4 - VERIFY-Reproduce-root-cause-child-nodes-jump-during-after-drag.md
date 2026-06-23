---
id: TASK-29.4
title: "[VERIFY] Reproduce & root-cause: child nodes jump during/after drag"
status: To Do
assignee: []
created_date: "2026-06-23 02:22"
labels:
  - ui
  - bug
  - needs-verification
dependencies:
  - TASK-29.2
parent_task_id: TASK-29
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

NEEDS VERIFICATION — first-pass diagnosis OVERTURNED. Symptom: module nodes expand correctly when a child is dragged, but child nodes randomly jump around the screen during/after the drag.

The initial diagnosis blamed parent-before-child array ordering. The verifier proved this cannot cause per-frame random jumps: positionAbsolute is recomputed idempotently each adopt (no accumulating drift), and updateAbsolutePositions repairs children on measurement. apply_parent_resize / compute_parent_resize math was verified correct and order-independent — NOT the source.

Corrected high-confidence cause (verifier): the apps OWN relative-vs-absolute coordinate confusion — virtual_renderer.tsx:31-43 get_visible_nodes AABB-tests child nodes using their PARENT-RELATIVE node.position as if absolute, so the wrong children get added/dropped from the controlled nodes={virtual_nodes} array as the viewport/debounce changes during a drag -> looks like jumping. code_chart_area.tsx:89 also passes a childs relative position to setCenter.

IMPORTANT GATING CAVEAT: the virtualization path only engages above 200 nodes (largeGraph gate, code_chart_area.tsx:135). On typical small flows this code is DORMANT — so if jumping reproduces on a SMALL flow, the cause is elsewhere and must be re-investigated. Reproduce first and confirm node count.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 After task-29.2, symptom reproduced and the triggering node count established (small flow vs >200-node flow)
- [ ] #2 Root cause confirmed (if it is the coordinate-space mismatch, confirm it only manifests >200 nodes; if it reproduces on a small flow, document the actual cause)
- [ ] #3 get_visible_nodes (virtual_renderer.tsx:31-43) and code_chart_area.tsx:89 resolve absolute position via react_flow_instance.getInternalNode(id).internals.positionAbsolute instead of node.position
- [ ] #4 Child nodes no longer jump during/after drag, verified on the flow size that reproduced it
- [ ] #5 Regression test or documented manual verification covers the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Land task-29.2 first.
2. Reproduce: drag a child on a SMALL flow, then on a >200-node flow; note which jumps.
3. If only >200 nodes: apply the absolute-position fix in virtual_renderer.tsx:31-43 and code_chart_area.tsx:89 (use getInternalNode().internals.positionAbsolute).
4. If small flow jumps: re-investigate — the coordinate fix would be dormant; find the real cause.
5. Confirm parent_resize math against measured child widths.
<!-- SECTION:PLAN:END -->
