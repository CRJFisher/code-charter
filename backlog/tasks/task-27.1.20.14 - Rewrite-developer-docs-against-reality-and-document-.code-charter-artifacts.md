---
id: TASK-27.1.20.14
title: Rewrite developer docs against reality and document .code-charter artifacts
status: To Do
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - docs
dependencies:
  - TASK-27.1.20.4
  - TASK-27.1.20.5
  - TASK-27.1.20.7
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Canonical developer docs are entirely stale] docs/DEBUGGING.md and docs/DEVELOPMENT.md reference launch configs, files, and scripts that do not exist, describe a three-package layout when there are five, and never mention drift, graph.db, the Stop hook, the target-repo model, or the reconcile loop — the entire mechanism under active development. A stale canonical doc is worse than none: a developer (including the author returning after a break) is led entirely astray, and stitch_eval / drift-inspect / drift:dev stay undiscoverable. QUICK WIN: stub or delete the misleading content immediately, then rewrite once the loop tooling (.4/.5/.7) lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Immediately stub or delete the stale DEBUGGING.md/DEVELOPMENT.md content so it stops actively misleading
- [ ] #2 Rewrite both docs against reality: five packages, target-repo model (Dev Host -> ~/workspace/bergamot), the install/reconcile chain, where graph.db lives, the full change->rebuild->trigger->inspect loop, the actual launch configs
- [ ] #3 Document stitch_eval as the quality loop, and the new drift-inspect (.4) and drift:dev (.7) tools
- [ ] #4 Document each .code-charter/ artifact: graph.db, drift_pending_reconcile.json, `drift_pending_reconcile.claim.<pid>.json` (the reconcile's claimed working set), stitch.json, descriptions.json, watermark files, drift_reconcile.lock, drift_reconcile_log.jsonl, drift_reconcile_status.json (the last-attempt/last-success/last-error rollup)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

Written in the canonical, self-contained style (present tense, no history). Documents the finished loop, so it lands after the tooling in .4/.5/.7.
<!-- SECTION:NOTES:END -->
