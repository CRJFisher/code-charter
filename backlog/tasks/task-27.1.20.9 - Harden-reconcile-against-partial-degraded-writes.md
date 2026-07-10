---
id: TASK-27.1.20.9
title: Harden reconcile against partial/degraded writes
status: Done
assignee: []
created_date: "2026-07-05 13:51"
labels:
  - drift
  - correctness
dependencies:
  - TASK-27.1.20.1
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[MEDIUM soft-integrity gaps] (a) reconcile() issues many independent store mutations with no turn-spanning transaction, so a mid-turn crash leaves half a turn applied. (b) The skill path lacks the code path deferred-retirement guards — a mid-edit truncated SKILL.md (or transiently missing sub-agent file) is unconditionally re-ingested and wholesale-overwrites the skill flow with a shrunken/degraded snapshot, no deferral, no signal. (c) Placeholder descriptions are written expecting the apply-descriptions pass to overwrite them, but nothing guarantees that pass runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 reconcile() wraps a turn in a single transaction (built on WAL from .1) so a mid-turn crash does not leave half a turn applied
- [x] #2 The skill path gains deferred-retirement / degraded-snapshot guards mirroring the code path; a truncated or partial SKILL.md bundle defers instead of overwriting
- [x] #3 Placeholder descriptions are guaranteed to be overwritten by the apply-descriptions pass, or their persistence is guarded/flagged if that pass does not run

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Reconcile applies a turn as many independent store mutations, and three soft-integrity gaps let a degraded input corrupt good diagram state: a mid-turn crash left half a turn on disk; a truncated or partial skill bundle was re-ingested unconditionally, overwriting a rich skill flow with a shrunken husk; and the deterministic describe pass wrote name-stand-in placeholders indistinguishable from finished text, silently persisting as "real" descriptions on any host whose agent upgrade pass never runs.

The fix hardens each gap against the same failure — a partial write overwriting good state — reusing the code path's existing "defer on an untrustworthy signal" discipline rather than inventing a new one. Turn atomicity is built on the WAL + single-writer discipline already established in task-27.1.20.1: the reconcile engine gains one transaction around the whole turn, so the turn is all-or-nothing without any new concurrency machinery.

At altitude: (1) `GraphStore` gains a `transaction(fn)` primitive — one `BEGIN IMMEDIATE` held across the turn's writes, committing together or rolling back on a throw/crash; `reconcile()` runs its body inside it, and the two agentic apply modes (`--apply-stitch`, `--apply-descriptions`), which issue the same compound writes, are wrapped too. (2) A skill bundle is screened on disk before ingest (`assess_skill_bundle`): an empty/unreadable SKILL.md, an unparseable meta.json, or a declared sub-agent file missing from the bundle defers the sync (recorded in `deferred_skill_syncs`, logged) and leaves the good flow untouched, retried next turn. (3) The describe pass tags awaiting-agent members `provisional` (distinct from a terminal over-cap `placeholder`), a durable `description_source` flag surfaced in the inspect breakdown and folded into the `high_placeholder_ratio` anomaly.

Front door: `packages/drift/src/reconcile/reconcile.ts` (the turn transaction and the skill-defer dispatch); the transaction primitive lives in `packages/core/src/storage/sqlite_graph_store.ts` and the `GraphStore` interface; the degraded-bundle guard is `assess_skill_bundle` in `packages/drift/src/reconcile/skill_dir.ts`, deliberately mirroring `ingest_skill`'s path resolver so it flags exactly the declarations ingest would try to resolve; the provisional split originates in `describe.ts` and is surfaced through `inspect/summary.ts`.

To know / watch: a SKILL.md truncated to *non-empty-but-parseable* is intentionally NOT deferred — like the code path's stance on a partially-broken seed file, it is indistinguishable from a genuine edit, so a fragile shrink heuristic was rejected in favor of concrete trustworthiness signals. AC#3 is satisfied by the "flagged if the pass does not run" branch (an agent-less host keeps provisional descriptions visibly provisional), not by guaranteeing the agent runs, which is impossible on such a host. The assess→ingest read is a two-read TOCTOU, consistent with the code path's existing check→hydrate window and self-healing on the next turn. Pre-existing, unrelated: `hydrate.test.ts` rides the Ariadne per-process state-accumulation flakiness and is a candidate for the package's per-suite jest isolation list.

### Implementation details

- `packages/types/src/graph_store.ts` — `transaction<T>(fn: () => Promise<T>): Promise<T>` added to the `GraphStore` contract; implemented on `SqliteGraphStore` (async counterpart of the private re-entrant `with_transaction`, sharing its `in_transaction` flag so nested synchronous writes run inline), `NullGraphStore`, `dry_run_store` (runs `fn` without a real transaction — its connection may be read-only), and both test recording-store mocks.
- `packages/drift/src/reconcile/reconcile.ts` — the turn body is extracted into `reconcile_turn` and run via `deps.store.transaction(...)`; skill bundles are screened by `assess_skill_bundle` before ingest and degraded ones deferred; `deferred_skill_syncs` threaded through `ReconcileResult`, the run-log record, `report_outcomes`, and the inspect summary/render.
- `packages/drift/src/reconcile/skill_dir.ts` — `assess_skill_bundle` plus a `bundle_relative` helper mirroring `ingest_skill`'s `resolve`/`posix_normalize` (EXTERNAL and `..`-escaping paths are non-defects; only a genuinely in-bundle missing file defers).
- `packages/core/src/agentic/describe_policy.ts` / `packages/drift/src/reconcile/describe.ts` — `DescriptionSource` gains `provisional`; the deterministic pass writes the `needs_llm` bucket as `provisional`. Threaded through `DescriptionCounts`, the inspect `DescriptionBreakdown`, and the `high_placeholder_ratio` anomaly (numerator now `provisional + placeholder`).
- `packages/drift/src/bin/drift_reconcile.ts` — `--apply-stitch` and `--apply-descriptions` wrapped in `deps.store.transaction` for the same turn atomicity.
- Tests: store-primitive commit/rollback/re-entrancy; a Proxy store that throws mid-reconcile proving the whole turn rolls back; `assess_skill_bundle` over healthy / empty-SKILL / unreadable / corrupt-meta / missing-sub-agent / external / `..`-escape bundles; a reconcile-integration defer preserving the good flow; `provisional` persistence and its provisional→llm overwrite; the anomaly firing on `provisional` and on the provisional+placeholder union.

Files: packages/drift/src/reconcile/reconcile.ts, packages/drift/src/reconcile/skill_dir.ts, packages/drift/src/reconcile/describe.ts
<!-- SECTION:NOTES:END -->
