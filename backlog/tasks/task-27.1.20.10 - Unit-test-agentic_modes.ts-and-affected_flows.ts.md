---
id: TASK-27.1.20.10
title: Unit-test agentic_modes.ts and affected_flows.ts
status: To Do
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - tests
dependencies: []
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM — the two most judgement-critical modules have no dedicated unit tests] agentic_modes.ts is the entire agent-facing write surface and affected_flows.ts is the membership/body-drift trigger core — a false negative there is precisely the stale-drift the mechanism exists to prevent, and it fails silently. Neither has a dedicated test; both are exercised only through slow built-bin subprocess suites. Locking their behavior now protects the refactors in .9 (harden writes) and .12 (enrich inventory).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 agentic_modes.test.ts: parse/apply per contract-breach shape, bridge-endpoint-not-in-graph skip, unresolved call span corroboration, apply_descriptions last-wins duplicate collapse — against an in-memory store and a hand-built CallGraph
- [ ] #2 affected_flows.test.ts: body-drift only, membership-drift only, both, neither, missing anchor_set self-heal, both zero-seed shapes

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Files: packages/drift/src/reconcile/agentic_modes.ts, packages/drift/src/reconcile/affected_flows.ts. Fast in-memory unit tests, not built-bin subprocess suites.
<!-- SECTION:NOTES:END -->
