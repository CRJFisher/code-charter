---
id: TASK-27.1.15.1
title: Strip the core relocation/reanchor accept-dance (full strip part 2)
status: To Do
assignee: []
created_date: "2026-06-09 15:14"
labels:
  - drift
  - graph-db
  - simplification
dependencies:
  - TASK-27.1.15
references:
  - task-27.0.3
  - task-27.1.2
  - task-27.1.6.4
parent_task_id: TASK-27.1.15
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

With customisation agent-mediated everywhere, a relocated symbol's attached content needs no human accept-gate: the agent re-anchors or regenerates it. The relocation/`reanchor` accept-dance — `re_extract` staging drift attributes on a relocated symbol instead of re-anchoring inline, `reanchor_node`, `outstanding_drift`, and the `drift.resolve {reanchor}` arm — exists only to surface an authored-content move for explicit acceptance. It is removed; a relocation re-anchors inline (the content rides across, a content-hash cache hit for descriptions) with no staged-drift round trip.

This is the core (task-27.0) half of the full strip, isolated from part 1 (task-27.1.15) so its blast radius is reviewable on its own. After it, `drift.resolve` has no remaining arm, and the drift MCP server and the SessionStart hook are removed entirely.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 `re_extract` re-anchors a relocated symbol inline instead of staging drift for explicit accept; the relocated→stage-drift branch (re*extract.ts:147-159) and the `DRIFT*\*`status keys are removed. A description rides across the rename via the inline re-anchor / content-hash cache, with no`drift.resolve` step.
- [ ] #2 Remove `reanchor_node`, `outstanding_drift`, and the `drift.resolve {reanchor}` arm. With the last arm gone, remove `drift.resolve` and the whole drift MCP server — `build_drift_server`, the `drift_mcp` bin entry, the `.mcp.json` registration, and the installer MCP wiring.
- [ ] #3 Remove the SessionStart hook and its installer entry once it has nothing left to announce (the bin half went in part 1; the relocation half goes here).
- [ ] #4 Membership-drift re-sync still handles a relocated member: the symbol-level delta (task-27.1.6.4) reshapes induced membership and re-syncs the affected flow. Verify with a relocation fixture — no regression.
- [ ] #5 No shims — full removal, all callers and tests updated; the drift MCP and SessionStart test suites are deleted, not edited. Full suite green.
<!-- AC:END -->
