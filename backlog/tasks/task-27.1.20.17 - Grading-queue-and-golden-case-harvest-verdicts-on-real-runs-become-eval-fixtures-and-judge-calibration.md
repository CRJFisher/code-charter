---
id: TASK-27.1.20.17
title: >-
  Grading queue and golden-case harvest: verdicts on real runs become eval
  fixtures and judge calibration
status: To Do
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - eval
  - dx
dependencies:
  - TASK-27.1.20.16
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Evaluating drift-sync today stacks two cognitively demanding tasks: doing meaningful work in a target repo while simultaneously judging how well the diagrams track the code. This task decouples them — trajectories are captured during normal work at zero attention cost (.15/.16) and graded later in a dedicated pass, seconds per case. The graded corpus then does double duty: graded runs are harvested into stitch_eval fixtures (golden sets are harvested from reality, not authored from imagination — hand-authored fixtures cover only adversarial gaps), and the human grades become the calibration set for any LLM quality judge (the answer to "who verifies the verifier": score the judge against the grades, re-score when the judge's model or prompt changes). Feeds .13 directly.

Seam-aware concretion (frozen): the grades sidecar schema is mechanism-agnostic (run_id, verdict, reason, graded_at — nothing drift-specific in the record shape) and the queue/harvest tools are standalone bins taking paths, so the shape can be lifted to a shared toolkit if a third mechanism (beyond drift and the sr- suite) ever needs run-record → trajectory → grade → golden. Until that promotion signal fires, this stays in packages/drift.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 drift-inspect --grade iterates ungraded runs newest-first, one screenful per run (changed file set, trajectory spine from .16, flow before/after summary), and records verdict (good/bad/mixed) plus a one-line reason to drift_run_grades.jsonl beside the store
- [ ] #2 A harvester converts a graded run into a stitch_eval fixture: input snapshot (file set + the minimal repo/store slice the run needs) + expected outcome + provenance (run_id, grade, graded_at); at least three fixtures harvested from real bergamot runs to prove the path
- [ ] #3 A calibration script scores an LLM judge's verdicts against the human grades corpus and reports raw agreement — the gate .13 uses before trusting any description-quality judge
- [ ] #4 Grading is resumable and idempotent (re-running --grade skips already-graded runs; re-grading a run overwrites its record explicitly, never duplicates)
- [ ] #5 Seam discipline per decision-10: the grades format is a pinned contract doc (generic keys top-level, drift context under detail); the grading queue renders any neutral-schema spine (.16 AC#3) rather than drift structures; the calibration script takes two JSONL paths and has zero drift imports

<!-- AC:END -->
