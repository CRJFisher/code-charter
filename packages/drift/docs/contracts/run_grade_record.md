---
contract: run_grade_record
contract_version: 1
file: drift_run_grades.jsonl
owner: drift-inspect --grade — sole producer today; the writer is upsert_grade in src/reconcile/grade_log.ts
consumers: drift-inspect --grade (resume/idempotency), drift-harvest (provenance), the
  calibration script (generic run_id+verdict join only)
pinned_by: src/reconcile/grade_log.test.ts, src/bin/drift_inspect.test.ts
---

# Run grade record (`drift_run_grades.jsonl`)

A keyed register beside the store: EXACTLY ONE line per graded `run_id` — the human's
current verdict on that reconcile run. Not an append-only event log (that is
`drift_reconcile_log.jsonl`); a re-grade REWRITES the run's line, it never appends a
second. Disposable — delete it with the db. Per decision-10, mechanism-agnostic keys
live at the top level and every drift-specific field lives under `detail`.

## Top-level keys (mechanism-agnostic)

| key            | type                       | semantics                                                                  |
| -------------- | -------------------------- | --------------------------------------------------------------------------- |
| schema_version | integer (= 1)              | required; a reader SKIPS any line whose value is not its own version, that lacks a `detail` object, or whose `verdict` is off-enum |
| run_id         | string                     | required; the reconcile-record / spine join key — the register key          |
| verdict        | "good" \| "bad" \| "mixed" | required; the human's judgement of the run                                  |
| reason         | string                     | required; one line, human prose — why this verdict                          |
| graded_at      | ISO-8601 string            | when the verdict was recorded                                               |
| detail         | object                     | the drift grading-context snapshot (below)                                  |

## `detail` keys (drift-specific)

| key                  | type                     | semantics                                                       |
| -------------------- | ------------------------ | ---------------------------------------------------------------- |
| mode                 | ReconcileMode            | the graded run's dispatch mode, copied from its run record       |
| file_set             | string[] (repo-relative) | the changed set the run consumed — the grader's primary anchor   |
| transcript_available | boolean                  | whether the grader saw a full spine or an effect-only fallback   |

## Uniqueness and crash-safety (the write rule)

The producer rewrites the whole file via temp + rename on every grade (the
`drift_reconcile_status.json` atomic-rewrite precedent), keyed by `run_id`, last-wins.
One line per `run_id` is guaranteed by construction — the literal reading of "a
re-grade overwrites its record explicitly, never duplicates". A reader ADDITIONALLY
folds last-wins over any duplicate `run_id` (tolerating a hand-appended line) but the
writer never produces one. Each grade is flushed immediately, so an interrupted session
keeps every prior grade — grading is resumable.

## Resume / regrade

The ungraded queue = the run-log's records (newest-first) MINUS the `run_id`s present in
this file. A plain `--grade` run skips already-graded runs. A re-grade is EXPLICIT:
`--regrade <run_id>` targets one run and overwrites its line; a graded run never
re-surfaces in the default queue.

## Versioning

Records of a foreign `schema_version` (or off-enum `verdict`) are skipped, never
migrated. The file is disposable, so a mixed-version file after an upgrade is expected.

## Example

```json
{"schema_version":1,"run_id":"20260710T140355123Z-a1b2c3d4","verdict":"good","reason":"stitched the dispatch cluster the refactor introduced","graded_at":"2026-07-10T15:02:11.004Z","detail":{"mode":"default","file_set":["src/dispatch.ts"],"transcript_available":true}}
```

## Changelog

- v1: initial split-shape grade register — generic verdict surface at the top level
  (run_id, verdict, reason, graded_at) + drift grading-context under `detail`.
