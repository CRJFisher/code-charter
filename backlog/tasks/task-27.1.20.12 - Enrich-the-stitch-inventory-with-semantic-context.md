---
id: TASK-27.1.20.12
title: Enrich the stitch inventory with semantic context
status: To Do
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - agentic
  - quality
dependencies:
  - TASK-27.1.20.10
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[HIGH — the agentic layer is under-fed] build_entrypoint_inventory emits only symbol_path/name/file/line/is_orphan/unresolved_sites per entrypoint, discarding the member names, docstrings, and existing description nodes its reachable_from walk already touches. Stitching is a semantic-similarity judgement, yet the agent gets zero semantic signal and must reconstruct everything via Read/Grep — exactly where the cost-tuned haiku default under-stitches, and under-stitching reads as "correct, no gap" (silent quality loss).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Extend InventoryEntrypoint in agentic_modes.ts with members: [{name, kind, docstring_first_line?}] from the existing reachable_from walk, plus each member existing description text where present
- [ ] #2 Update SKILL.md phase-1 guidance to rank candidates by name/description similarity first, then confirm top candidates by reading the call site
- [ ] #3 Report per-flow described-coverage (placeholder vs llm counts) in the list-entrypoints output

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/reconcile/agentic_modes.ts, packages/drift/assets/skills/drift-sync/SKILL.md, packages/core/src/agentic/gap_detection.ts. Behavior locked by .10 first.
<!-- SECTION:NOTES:END -->
