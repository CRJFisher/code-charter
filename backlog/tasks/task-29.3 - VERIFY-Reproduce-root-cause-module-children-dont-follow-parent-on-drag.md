---
id: TASK-29.3
title: "[VERIFY] Reproduce & root-cause: module children dont follow parent on drag"
status: Done
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

- [x] #1 After task-29.2, the symptom is reproduced on the running app and confirmed real (or confirmed NOT a bug and this task closed as such)
- [x] #2 If real: the actual root cause is identified with file:line evidence (NOT array ordering)
- [x] #3 A fix is implemented for the confirmed root cause and children visibly follow their parent on drag
- [x] #4 A regression test covers the confirmed root cause
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Land task-29.2 first (overlap must be gone to observe drag behavior).
2. Run the app (/run or verify skill), drag a module node, observe whether children follow.
3. If they do follow -> close as not-a-bug. If not -> add RF debug logging of parentLookup contents AFTER first measurement, and check the three verifier candidates: measured child dimensions, parentId survival at custom_graph_to_react_flow.ts:56, ELK nesting at build_elk_graph:59.
4. Fix root cause; add test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The symptom is real and the first-pass diagnosis was correctly overturned: array ordering is not the cause. The actual cause is the layout-persistence path. The webview chart restored a layout snapshot from `localStorage` on every load and returned before the layout pipeline ran, so a snapshot captured during the pre-29.2 broken era — every module at `{0,0}` with no `style` dimensions — was replayed forever. With all modules at the origin, each function resolved to the same parent-relative absolute position, so the whole graph stacked on one spot and dragging a module appeared to leave its children behind (you were grabbing one of many modules piled at the origin). Because restore bypassed the pipeline unconditionally, the 29.1 and 29.2 fixes never reached the running app.

The fix removes layout persistence-on-load entirely: the chart now always computes a fresh layout from the current graph. A graph change or a layout-algorithm change is reflected immediately, and a stale snapshot can never be replayed. Export/Import to a file remain as explicit user actions. With the fresh pipeline, modules occupy distinct, non-overlapping positions and children follow their module on drag — confirmed live on the bergamot flow.

### Reproduction and root-cause evidence

- Reproduced live (AC#1): in the Extension Development Host, the chart showed all nodes overlapping and module drag did not move children. Instrumentation proved the React Flow store held correct parent links yet every child's `positionAbsolute` equalled its parent-relative `{40,70}`, i.e. every module sat at `{0,0}`. The `RESTORED FROM SAVED STATE` log fired and the fresh-layout diagnostics did not — the restore early-return was being taken. Disabling restore made the graph lay out correctly and drag-follow work, isolating the cause.
- Root cause (AC#2), file:line in the pre-fix tree:
  - `code_chart_area.tsx` render effect — `const saved_state = load_graph_state(selected_flow_id); if (saved_state) { set_nodes(saved_state.nodes); ...; return; }` restored the snapshot and returned before `custom_graph_to_react_flow` / `apply_hierarchical_layout`.
  - `code_chart_area.tsx` `on_init` — restored `saved_state.viewport`.
  - `state_persistence.ts` `load_graph_state` — keyed only on `entry_point` + a 24h TTL, with no structural validation, so a broken/legacy snapshot was returned as valid.
- The adapter (`custom_graph_to_react_flow`, task-29.2) and ELK nesting were verified correct in isolation, confirming the defect was the restore-bypass, not the layout math.

### The fix

- `code_chart_area.tsx`: removed the restore-on-mount early-return, the debounced autosave effect, the saved-viewport restore in `on_init`, and the Save/Clear buttons that fed the `localStorage` slot. The layout is always computed fresh; `fitView` frames the viewport.
- `state_persistence.ts`: removed `save_graph_state` / `load_graph_state` / `clear_graph_state`. `GraphState`, `export_graph_state`, and `import_graph_state` (file actions) remain. (Import is retained per request but currently has no toolbar button — pre-existing.)
- `chart_config.ts` / `CONFIG.md`: removed the now-orphaned `animation.debounce.save` constant.

### Tests (AC#4)

- `module_nesting_layout.test.ts` drives the real pipeline (adapter → real ELK `apply_hierarchical_layout`) and pins the invariants the defect violated: modules carry concrete `style` dimensions, module bounding boxes do not overlap, and children of different modules share an identical parent-relative position while their parents sit at different absolute positions — the precise condition that makes a child follow its module on drag.
- `state_persistence.test.ts` adds a restore-bypass guard asserting the module no longer exposes any `load`/`save`/`clear` localStorage primitive, so re-introducing the restore-on-mount path fails the suite.

<!-- SECTION:NOTES:END -->
