---
id: TASK-27.1.20.17
title: >-
  Grading queue and golden-case harvest: verdicts on real runs become eval
  fixtures and judge calibration
status: Done
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

- [x] #1 drift-inspect --grade iterates ungraded runs newest-first, one screenful per run (changed file set, trajectory spine from .16, flow before/after summary), and records verdict (good/bad/mixed) plus a one-line reason to drift_run_grades.jsonl beside the store
- [ ] #2 A harvester converts a graded run into a stitch_eval fixture: input snapshot (file set + the minimal repo/store slice the run needs) + expected outcome + provenance (run_id, grade, graded_at); at least three fixtures harvested from real bergamot runs to prove the path
- [x] #3 A calibration script scores an LLM judge's verdicts against the human grades corpus and reports raw agreement — the gate .13 uses before trusting any description-quality judge
- [x] #4 Grading is resumable and idempotent (re-running --grade skips already-graded runs; re-grading a run overwrites its record explicitly, never duplicates)
- [x] #5 Seam discipline per decision-10: the grades format is a pinned contract doc (generic keys top-level, drift context under detail); the grading queue renders any neutral-schema spine (.16 AC#3) rather than drift structures; the calibration script takes two JSONL paths and has zero drift imports

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The grading pass, the golden harvester, and the judge-calibration gate are built, tested, and pinned by three contract docs; the one open item is AC#2's operational step — harvesting three fixtures from real bergamot runs — deferred by explicit user decision until organically captured runs can be graded with adequate context (see the .19 note below).

`drift-inspect --grade` walks the ungraded runs newest-first, one screenful each: the changed file set, the .16 trajectory spine rendered through `render_trajectory` verbatim (the neutral seam AC#5 demands), and a flow summary grouped by action. One stdin line per run (`good|bad|mixed <reason>`, `s`kip, `q`uit; TTY and pipe behave identically); every accepted verdict is persisted before the next screen, so an interrupted session loses nothing and the next one resumes over what remains. Grades land in `drift_run_grades.jsonl` — a keyed register (docs/contracts/run_grade_record.md), exactly one line per run_id, rewritten atomically per grade: a re-grade is the explicit `--regrade <run-id>` and overwrites in place, never duplicates. `drift-harvest` freezes a good-graded run whose outcomes touch live flows into a stitch_eval fixture — byte-exact source snapshot of the run's file set (plus `--extra`, capped at 128KB, path-contained), an expectation derived in stitch_eval's own `FixtureExpectation` vocabulary (`src/reconcile/harvest.ts`; retire-only and no-op runs are refused rather than silently widened to unrelated flows), and full provenance — into `stitch_eval_harvested/<slug>/fixture.json`, which stitch_eval discovers beside its hand-authored array: harvesting is a pure file drop. `drift-calibrate` joins human grades with a judge's verdicts on run_id and reports raw agreement + a confusion tally + coverage (docs/contracts/judge_calibration.md); it is node-builtins-only with an import-boundary test, so it lifts to a shared home untouched — the .13 gate reads its `raw_agreement`.

Review (7 lenses) confirmed ACs #1/#3/#4/#5 satisfied and drove: the refusal that replaced the harvester's all-live-flows fallback, whitespace-tolerant verdict parsing, the full-run_id fixture slug (truncation had discarded the uniqueness suffix), Buffer-exact snapshots, path containment, a named error on a corrupt store, `process.exitCode` over `process.exit` in the grade loop, bin-map registration for `drift-harvest`/`drift-calibrate`, and unit coverage for all three manifest kinds, the scaffold wiring, the byte cap, and `--extra`. Noted, not actioned: `grade_log.ts` naming vs its register semantics, orphaned temp accumulation after crashes, screen-height bounding.

**Deferral and the .19 evidence.** During verification, three real runs were generated against a copy of bergamot's store and presented for grading — and the grader (the user) correctly refused to grade them: the text screenful (effect lines + counts) did not carry enough context to judge whether the diagrams actually tracked the code, and the runs' hand-invoked provenance meant no spine context/judgement to show. That refusal is direct field evidence for task-27.1.20.19 (the visual grading surface): the .17 screenful is sufficient plumbing but insufficient presentation for trustworthy verdicts. AC#2's three-fixture harvest is therefore owned by task-27.1.20.19's inherited operational loop (install the new drift build in bergamot, work normally, grade on the visual surface, harvest); the harvester and its path are proven end-to-end by tests over real reconciled stores.
<!-- SECTION:NOTES:END -->
