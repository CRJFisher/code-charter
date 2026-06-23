---
id: TASK-29.3
title: "[VERIFY] Reproduce & root-cause: module children dont follow parent on drag"
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

NEEDS VERIFICATION — first-pass diagnosis OVERTURNED. Symptom: dragging a module (parent) node does not move its child function nodes.

The initial diagnosis blamed parent-before-child array ordering. The adversarial verifier read the @xyflow v12.8.2 internals and proved this is WRONG: adoptUserNodes puts every node in nodeLookup regardless of order; updateNodeInternals + updateAbsolutePositions (react index.js:3264-3270) rebuild parentLookup and child absolutes order-independently after measurement; drag-follow recomputes child positionAbsolute from the parent each render and never depends on array order. The ordering fix (task-29.2) only silences the console warning — it will NOT fix drag-follow.

This task is: REPRODUCE the symptom on the running app AFTER task-29.2 lands, confirm it is real, then root-cause it. Do NOT ship a speculative fix.

Verifier candidate causes to investigate (in order): (1) children never get measured dimensions (zero w/h) so the updateNodeInternals doUpdate guard (system:1751) never fires and the child is never linked; (2) parentId dropped because the contains-edge / emitted.has(parent_id) guard at custom_graph_to_react_flow.ts:56 failed, making the child top-level; (3) ELK did not actually nest the child under the compound node (build_elk_graph:59 only nests when module_ids.has(fn.parentId)).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 After task-29.2, the symptom is reproduced on the running app and confirmed real (or confirmed NOT a bug and this task closed as such)
- [ ] #2 If real: the actual root cause is identified with file:line evidence (NOT array ordering)
- [ ] #3 A fix is implemented for the confirmed root cause and children visibly follow their parent on drag
- [ ] #4 A regression test covers the confirmed root cause
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Land task-29.2 first (overlap must be gone to observe drag behavior).
2. Run the app (/run or verify skill), drag a module node, observe whether children follow.
3. If they do follow -> close as not-a-bug. If not -> add RF debug logging of parentLookup contents AFTER first measurement, and check the three verifier candidates: measured child dimensions, parentId survival at custom_graph_to_react_flow.ts:56, ELK nesting at build_elk_graph:59.
4. Fix root cause; add test.
<!-- SECTION:PLAN:END -->
