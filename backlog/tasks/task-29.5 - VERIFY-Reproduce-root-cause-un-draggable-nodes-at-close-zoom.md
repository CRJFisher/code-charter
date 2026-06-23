---
id: TASK-29.5
title: "[VERIFY] Reproduce & root-cause: un-draggable nodes at close zoom"
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
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

NEEDS VERIFICATION — may be a NON-BUG. Symptom as reported: a different node set shows when zoomed in close (zoom >= ZOOM_THRESHOLD 0.45) and those nodes cant be dragged.

Verifier findings: the DIFFERENT NODE SET half is BY DESIGN — ModuleGroupNodeComponent returns null at zoom >= 0.45 (chart_node_types.tsx:128-130) and ZoomAwareNode switches functions to full detail. The NOT-DRAGGABLE half has NO demonstrated mechanism: RF renders all nodes as flat siblings, parent geometry lives in the store (not the DOM), and a parent component returning null does not affect a childs positionAbsolute or its own drag wiring. The proposed transparent-container fix is a confirmed no-op for draggability — do NOT apply it.

This task is: REPRODUCE on the running app. If nodes really are un-draggable at zoom, investigate the verifier candidates: (a) the extent y-min = headerHeight clamping upward drags (i.e. cant drag PAST THE TOP, misread as cant drag); (b) the virtual_renderer dropping a parent while keeping children above the 200-node gate (children then miss their parent in the rendered array).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Symptom reproduced on the running app at zoom >= 0.45, or confirmed NOT a bug and task closed
- [ ] #2 If real: actual root cause identified (extent clamp vs virtualization parent-drop vs other) with file:line evidence — NOT the disproven null-parent-DOM-nesting theory
- [ ] #3 If real: fix implemented and nodes are draggable at close zoom; do NOT apply the transparent-container change
- [ ] #4 The 'different node set at close zoom' behavior is confirmed intended (modules hidden, functions detailed) or adjusted if deemed wrong UX
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Land task-29.2 first.
2. Run the app, zoom past 0.45, try to drag a function node.
3. If draggable -> close as not-a-bug (confirm the different node set is acceptable UX).
4. If not: check whether it is only upward movement (extent y-min=headerHeight clamp) vs fully stuck; and whether node count > 200 (virtualization dropping the parent).
5. Fix the confirmed cause only.
<!-- SECTION:PLAN:END -->
