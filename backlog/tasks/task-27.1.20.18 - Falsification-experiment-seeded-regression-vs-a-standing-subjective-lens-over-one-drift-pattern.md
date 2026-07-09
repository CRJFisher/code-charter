---
id: TASK-27.1.20.18
title: >-
  Falsification experiment: seeded regression vs a standing subjective lens
  over one drift pattern
status: To Do
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - eval
  - research
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Bet 1 of the frozen-decisions falsification agenda (~/workspace/claude-config/research/frozen-decisions/README.md): no mechanism in the research corpus has yet caught a regression in code that ships value — the entire pattern-eval-set idea rests on the claim that a standing subjective lens can. Test the claim directly: pick one judgement-level drift pattern that plain tests cannot express (candidate: preservation guarantees hold across reconcile changes — user-owned fields survive, misses land in the recovery bin, nothing is silently pruned), curate a small mixed-label case set, seed a deliberate regression on a branch, and measure whether a lens replay catches it and at what token cost.

Either outcome pays: a catch at tolerable cost converts the pattern-eval-set primitive from taxonomy to tool (its promotion signal, fired deliberately); a miss or an intolerable cost kills or reshapes the primitive before more is built on it. Runs standalone — .17's grading queue makes case curation cheaper but is not a prerequisite (cases can be curated by hand from recent reconcile history).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 One judgement-level pattern chosen and specified as numbered assertions (the pattern spec a lens judges against), checked into the repo beside the eval assets
- [ ] #2 A mixed-label case set of at least 6 cases exists (pass and fail exemplars), harvested from real reconcile history where possible, hand-authored otherwise, each case carrying provenance
- [ ] #3 A deliberate regression violating the pattern is seeded on a branch; the lens replay is run against both branches; catch/miss, false-positive count, and tokens-per-case are recorded
- [ ] #4 The result is written back into the frozen-decisions falsification agenda (bet 1), with an explicit build / reshape / kill recommendation for the pattern-eval-set primitive

<!-- AC:END -->
