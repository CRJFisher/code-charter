---
contract: judge_calibration
contract_version: 1
files: judge-verdicts JSONL (input, produced by the .13 judge) + agreement report (stdout)
owner: the calibration script (src/bin/drift_calibrate.ts) — consumer of both JSONLs
producers: drift-inspect --grade (human grades) + the .13 judge (judge verdicts)
pinned_by: src/bin/drift_calibrate.test.ts
---

# Judge calibration I/O

The calibration script takes TWO JSONL paths — the human grades corpus
(`drift_run_grades.jsonl`, the run_grade_record contract) and a judge's verdicts —
joins them on `run_id`, and reports raw agreement. It imports ZERO drift modules and
uses node builtins only: it reads ONLY the generic keys `run_id` + `verdict` from both
files. `detail` on either side is never touched — that is what keeps it drift-free and
liftable to a shared home untouched.

## Judge-verdicts file (input; the .13 judge produces it)

Mirrors the grade record's GENERIC surface so the join is a generic operation:

| key            | type                       | semantics                                            |
| -------------- | -------------------------- | ----------------------------------------------------- |
| schema_version | integer (= 1)              | the calibrator skips a foreign version                |
| run_id         | string                     | join key to a human grade                             |
| verdict        | "good" \| "bad" \| "mixed" | the judge's verdict — the SAME enum as human grades   |
| reason         | string                     | the judge's rationale — advisory, never scored        |
| judged_at      | ISO-8601 string            | when the judge ran                                    |
| detail         | object                     | judge-specific (model id, prompt hash); IGNORED by the calibrator, written for re-score triggers |

## Agreement report (stdout — JSON with `--json`, else text)

| key           | type          | semantics                                           |
| ------------- | ------------- | ---------------------------------------------------- |
| human_total   | integer       | effective human grades read (last-wins per run_id)   |
| judge_total   | integer       | effective judge verdicts read                        |
| joined        | integer       | run_ids present in BOTH                              |
| agreements    | integer       | joined rows where the verdicts are equal             |
| raw_agreement | number \| null| agreements / joined — the headline gate metric; null when joined is 0 |
| confusion     | object        | counts keyed `<human_verdict>-><judge_verdict>`      |
| human_only    | string[]      | run_ids graded by the human, missing a judge verdict |
| judge_only    | string[]      | run_ids judged, missing a human grade                |

`raw_agreement` is the number the .13 gate reads before trusting any description-quality
judge, re-checked whenever the judge's model or prompt changes. `confusion` and the
coverage arrays make systematic bias and coverage gaps visible, but the gate is raw
agreement.

For its verdicts to be comparable with the human corpus, the judge consumes the same
grading context the human grader saw: the run's changed file set, its trajectory spine
(the .16 neutral schema), and the flow descriptions — the .13 judge spec owns the
judging logic itself.

## Changelog

- v1: initial calibration I/O — judge verdicts mirror the grade generic surface; the
  report headlines raw_agreement with a confusion tally + coverage arrays.
