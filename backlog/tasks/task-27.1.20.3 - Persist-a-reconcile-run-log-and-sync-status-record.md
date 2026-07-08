---
id: TASK-27.1.20.3
title: Persist a reconcile run log and sync-status record
status: Done
assignee: []
created_date: "2026-07-05 13:50"
labels:
  - drift
  - observability
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[Data source for all other tooling] FlowOutcome, DeferredRetirement, hydration-cap notices, and stitch skip reasons are serialized to stderr — which lands in the Claude session transcript, a different process — and then discarded. Nothing in graph.db can answer "why did flow X get retired?", "why was retirement deferred and did it ever complete?", or "which file set drove the last sync?". Silence-by-design makes correctness bugs indistinguishable from healthy no-ops; a durable record is the shared fix for findings in both review goals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Append per turn to a JSONL sidecar (drift_reconcile_log.jsonl beside graph.db) or a disposable reconcile_log table: timestamp, file set, per-flow action + reason, deferred retirements with reasons, placeholder-vs-llm description counts
- [x] #2 Include a last-attempt / last-success / last-error sync-status record so a silently dropped or failed reconcile is distinguishable from nothing-changed
- [x] #3 Log a diagnostic when a delta.modified symbol_path fails the anchored_symbols join in body_modified_member_ids (the known two-id-space seam, a silent-staleness hole)

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Every reconcile turn used to report itself only on stderr, which lands in the Claude session transcript and dies with it — so graph.db could never answer "why did flow X get retired?", "was that deferral ever completed?", or "which file set drove the last sync?", and a failed reconcile was indistinguishable from a healthy no-op. The reconcile bin now leaves a durable record beside the store.

Two sidecar files carry it, deliberately files rather than store tables: the record must be writable exactly when the store cannot be — the fatal path fires after `store.close()`, the garbage-db path before the store ever opens, and `--dry-run` holds a read-only connection. `drift_reconcile_log.jsonl` appends one record per completed turn: timestamp, mode, normalized file set, per-flow outcomes each carrying a required `reason`, deferred retirements with reasons, the describe-source split (`docstring`/`placeholder`/`llm`), and every stderr diagnostic the run emitted (hydration-cap notices, stitch skips, join misses) — the bin's `log` closure collects them, so nothing that used to die on stderr is lost. `drift_reconcile_status.json` is the O(1) health rollup: `last_attempt_at` is stamped before work starts (a killed run reads as attempt > success), a success clears `last_error`, and fatal exits and lock contention record it. `--dry-run` writes neither file.

Navigation: `packages/drift/src/reconcile/reconcile_log.ts` owns both file formats and all sidecar IO (best-effort — a log failure never fails a reconcile); `packages/drift/src/bin/drift_reconcile.ts` owns every write point (the engine stays fs-free); `reconcile.ts` supplies the reasons, the count aggregation, and the AC#3 join-miss diagnostic in `body_modified_member_ids`; `hydrate.ts` returns the per-flow describe tally.

Known edges: the status merge is best-effort last-writer-wins, not lost-update-safe across racing processes; the JSONL records completed turns only (failures live in the status file); log growth is unbounded by design (one line per turn, disposable with the db). The apply-stitch stdout wire stays `{ flows }` — the describe tally rides only the run record.

<!-- SECTION:NOTES:END -->
