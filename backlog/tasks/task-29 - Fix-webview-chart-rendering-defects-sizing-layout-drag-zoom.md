---
id: TASK-29
title: "Fix webview chart rendering defects (sizing, layout, drag, zoom)"
status: To Do
assignee: []
created_date: "2026-06-23 02:21"
labels:
  - ui
  - bug
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The React Flow (@xyflow/react v12.8.2 + elkjs) chart in the VS Code webview has multiple rendering defects: a large empty right margin, all nodes overlapping in the initial view, module children not following their parent on drag, child nodes jumping during/after drag, and a different (un-draggable) node set when zoomed in.

A deep multi-agent diagnosis (12 agents, adversarial verification) reduced the five reported symptoms to TWO confirmed root causes with safe fixes, plus THREE symptoms whose first-pass diagnosis was OVERTURNED on verification and which must be reproduced before any fix is written.

Key finding: the initial theory blamed React Flow node-array ordering (parent-before-child) for almost everything. Verification against the RF v12.8.2 internals proved RF self-heals array ordering on the measurement cycle (updateNodeInternals -> updateAbsolutePositions, order-independent). So ordering genuinely causes ONLY the initial overlap; the drag/zoom symptoms have different (or no) real causes and need live reproduction.

Decision (see Implementation Notes): KEEP the zoom + virtualization feature. Only 1 of 5 symptoms is entangled with zoom, virtualization is dormant below 200 nodes (CONFIG.performance.nodes.largeGraph gate), and the two confirmed bugs are zoom-independent. Removing it is churn against a possibly-nonexistent bug.

Subtasks:

- .1 right margin + vertical overflow (CONFIRMED)
- .2 initial node overlap / parent-before-child ordering (CONFIRMED)
- .3 children dont follow parent on drag (NEEDS VERIFICATION - diagnosis overturned)
- .4 child nodes jump during/after drag (NEEDS VERIFICATION - diagnosis overturned)
- .5 un-draggable nodes at close zoom (NEEDS VERIFICATION - may be non-bug)
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

ZOOM REMOVAL DECISION: keep zoom + virtualization. Rationale: only the zoom-virtualization symptom (.5) carries depends_on_zoom=true; the other four are independent. Virtualization (virtual_renderer.tsx) only engages above CONFIG.performance.nodes.largeGraph (200) nodes; below that it returns all nodes. The two confirmed bugs (.1, .2) are unrelated to zoom. Ripping it out touches ZoomAwareNode, ModuleGroupNode, the threshold selector, and zoom_mode state — real regression surface — to fix a symptom that verification could not even confirm is a bug. If a real >200-node defect is later found, temporarily lift the largeGraph gate rather than delete code.

RECOMMENDED ORDER: ship .1 and .2 (confirmed, safe), then drive the app and try to reproduce .3/.4/.5 on a small flow first, then on a >200-node flow. .4 and .5 real causes (if any) are gated to large graphs.

<!-- SECTION:NOTES:END -->
