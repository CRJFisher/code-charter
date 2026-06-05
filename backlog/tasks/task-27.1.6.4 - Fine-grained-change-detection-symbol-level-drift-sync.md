---
id: TASK-27.1.6.4
title: "Fine-grained change detection: drive drift sync from the symbols that changed, not the files that were touched"
status: Done
created_date: "2026-06-04"
assignee: []
labels:
  - drift
  - change-detection
  - ariadne
  - flows
  - graph-db
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.6
  - task-27.1.2
references:
  - backlog/tasks/task-27.1.2 - First-milestone-leaf-rename-drift-and-preservation-fix.md
  - backlog/tasks/task-27.1.6.1 - Drift-MCP-tool-ergonomics-try-out-and-review.md
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Re-examine how the drift reconcile script detects change, and rework it to track **what code actually changed** at symbol granularity rather than which files were touched.

**Today the unit of change is the file.** The `Stop` hook hands `reconcile(file_set)` the set of files edited this turn; a persisted flow re-syncs whenever any member's *defining file* intersects that set (`affected_flows.ts` → `affected_persisted_flows`), regardless of whether the symbol that actually changed is in the flow, and regardless of whether the edit changed any symbol body at all. The headless engine also **rebuilds the entire Ariadne call graph from scratch every run** (`HeadlessProject.initialize` scans and re-indexes the whole repo), even though Ariadne's `Project` is explicitly incremental (`update_file`/`remove_file` with dependent tracking) — the bin is a fresh process each turn, so that incrementality is thrown away. This is the uncached full-repo-index cost flagged in task-27.1.6.1.

**The symbol-level signal already exists but is not used to scope work.** `re_extract` (task-27.1.2) resolves every preserved, anchored node in the changed files against the fresh resolver index and classifies it `hit` / `relocated` / `miss` by comparing its `symbol_path:content_hash` anchor — but that verdict drives **description preservation only**. Nothing aggregates these per-node verdicts into a "which symbols changed this turn" delta, and nothing uses such a delta to decide which flows re-sync or which symbols re-describe.

**This task computes and uses that delta.** A turn's edits are reduced to a structured, symbol-level change set — symbols **added**, **removed**, **body-modified** (`content_hash` changed under a stable `symbol_path`), and **relocated** (`symbol_path` changed under a stable body) — by diffing the freshly-extracted symbol state of the changed files against the **persisted anchor state already in the store** (Ariadne supplies the structure; the resolver's existing `content_hash` supplies body identity). Re-sync and re-describe are then **scoped to the delta**: a flow re-syncs only when a changed symbol lies in its induced membership; only added/body-modified symbols are re-described; a whitespace/comment-only edit that changes no symbol body reconciles nothing. This sharpens correctness (no spurious whole-flow re-syncs off an unrelated edit in a shared file) and cuts cost (the reconcile stops doing downstream work the delta proves unnecessary).

This is doc-5's "the diagram absorbs drift out-of-band" made precise: drift follows the **code change**, not the file save. It rides the existing `Stop`-hook → `drift-reconciler` sub-agent → `drift-sync` → `reconcile` chain and the task-27.0 store as-is — no second hook, no new table, no schema migration.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 **Symbol-level delta:** a turn's edits produce a structured change set — `{added, removed, modified, relocated}` keyed by `symbol_path` — computed from the fresh Ariadne extraction of the changed files diffed against the store's persisted anchors (`symbol_path:content_hash`), not from the raw changed-file list. `modified` = body changed under a stable `symbol_path`; `relocated` = `symbol_path` changed under a stable body (the resolver's existing verdict, surfaced as an aggregate)
- [ ] #2 **Scoped re-sync:** a persisted flow re-syncs only when the delta intersects its induced membership (a changed *symbol* is a member), replacing the changed-*file* intersection in `affected_flows.ts`. An edit to a file that changes no symbol belonging to a flow does not re-sync that flow
- [ ] #3 **Scoped re-describe:** only `added` and `modified` symbols are (re-)described; an unchanged symbol's description is left exactly as-is (beyond the task-27.1.6 preservation guarantee), and a `relocated` symbol carries its description via the resolver rather than being re-described
- [ ] #4 **No-op on non-semantic edits:** a whitespace/comment-only edit (empty delta — no body change, no add/remove/relocate) reconciles nothing: no flow write, no `last_synced_at` churn, no description rewrite
- [ ] #5 **Cost posture documented:** state the relationship between the delta and the whole-repo Ariadne index — what the delta saves downstream (spurious re-syncs, needless re-describes/flow writes) — and decide whether index incrementality (a persisted Ariadne `Project` or changed-file-only indexing across `Stop`-hook runs) is in scope here or a named follow-up, grounded in the task-27.1.6.1 cache-cost note
- [ ] #6 **Additive, no new trigger surface:** the delta is computed from existing persisted anchors + the fresh graph; no second hook, no review queue, no new table, no schema migration. Preserves task-27.1.6's invariants (auto-sync only; the `drift.*` surface stays user-facing)
- [ ] #7 **Tests:** fixtures exercising each delta class — add, remove, body-modify, rename/relocate, and comment-only-no-op — asserting precise re-sync scoping (only flows containing the changed symbol) and precise re-describe scoping (only changed symbols touched)

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Define the symbol delta.** Extend the `re_extract`/resolver path to emit an aggregate `SymbolDelta` (`{added, removed, modified, relocated}` of `symbol_path`s) for the changed files, derived from the fresh resolver index vs. the persisted anchors — promoting the per-node `hit`/`relocated`/`miss` verdicts that `reconcile_node` already computes into a turn-level change set.
2. **Scope re-sync to changed symbols.** Replace the changed-file intersection in `affected_persisted_flows` with a changed-*symbol* intersection over each flow's re-induced membership, so a flow re-syncs only when the delta actually reaches it.
3. **Scope re-describe to the delta.** Drive the describe step (`describe.ts`, `hydrate_code_flow`) from the delta's `added` ∪ `modified` set; leave unchanged symbols' descriptions untouched and let `relocated` ride the resolver's carry-across.
4. **Make an empty delta a clean no-op.** A turn whose delta is empty writes nothing (no flow upsert, no `last_synced_at` stamp).
5. **Assess index incrementality (AC#5).** Measure/decide whether to persist or incrementally feed the Ariadne `Project` across runs vs. continue full re-index; record the decision and cost trade-off in the notes, spinning a follow-up if it is larger than this task.
6. **Fixtures + tests.** One fixture per delta class (add / remove / body-modify / rename-relocate / comment-only), asserting re-sync and re-describe scoping.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Drift reconciliation now follows the **code change**, not the file save. The unit of change is the symbol: a turn's edits are reduced to a structured, symbol-level delta, and re-sync and re-describe are scoped to it. An unrelated edit in a file a flow shares no longer re-syncs that flow, and a whitespace/comment edit that changes no flow member's body reconciles nothing.

The delta is built from signals that already exist, so no new trigger surface is added. `compute_symbol_delta` (in `@code-charter/core`, `reextract/symbol_delta.ts`) diffs the fresh resolver index of the changed files against the store's persisted anchors (`symbol_path:content_hash`), reusing `resolve_anchor`'s per-anchor cascade: a `body-changed` verdict becomes `modified`, `relocated` becomes `relocated`, a `miss` becomes `removed`, and any fresh symbol_path with no persisted anchor is `added`. It is the aggregate promotion of the same verdicts `re_extract` already computes node-by-node for description preservation, so `re_extract` returns it alongside its findings — additively, no signature break for existing `findings` consumers.

Re-sync scoping moves into two complementary triggers in `affected_persisted_flows`. A code flow re-syncs when **body drift** occurs (a `modified` symbol, mapped to its live `SymbolId`, is in the flow's induced membership) or when **membership drift** occurs (the flow's freshly induced member-path set differs from its stored `anchor_set` — the id-robust realization of the delta's `added`/`removed`/`relocated` structural classes reaching that flow). A flow with no live code seed (a skill/doc flow, or a flow whose seed was deleted/renamed) is left to the hydrate-step remap/strand path, never force-stranded here.

To read the result, start at `reconcile.ts` step 3b: it computes the body-modified `SymbolId`s, calls `affected_persisted_flows`, then re-syncs each hit. The delta itself lives in `core/reextract/symbol_delta.ts`; the triggers live in `drift/reconcile/affected_flows.ts`. The "anchor_set == paths_of(members)" invariant is single-sourced by `paths_of`, lifted into `core/model/flow.ts` next to `flow_id_of`.

## How the acceptance criteria are met

- **#1 Symbol-level delta** — `compute_symbol_delta` produces `{added, removed, modified, relocated}` keyed by `symbol_path`, computed from the fresh extraction diffed against persisted anchors; unit-tested per class in `symbol_delta.test.ts`.
- **#2 Scoped re-sync** — the changed-file intersection in `affected_persisted_flows` is replaced by the body-drift + membership-drift triggers. Proven by `reconcile_delta.test.ts`: an unrelated new symbol in a flow's file does not re-sync it, and a cross-file member deletion (no caller edit) re-syncs via the membership-drift trigger alone.
- **#3 Scoped re-describe** — delivered by the describe step's content-hash cache (`plan_descriptions`): an unchanged member's `content_hash` matches its persisted `description_hash`, so it is skipped; only `added`/`modified` (cache misses) are described. A `relocated` symbol is explicitly **not** re-described — `hydrate_code_flow` skips the relocation targets (`relocated_targets`), letting the resolver carry the existing description across via the relocation `re_extract` stages and `drift.resolve` commits. This also avoids a wasted model call and a duplicate description node on the renamed path.
- **#4 No-op on non-semantic edits** — falls out: an edit changing no member body and no membership matches neither trigger, so no flow write and no `last_synced_at` churn (tested).
- **#5 Cost posture** — see below.
- **#6 Additive** — no second hook, no new table, no schema migration; only additive exports (`compute_symbol_delta`, `SymbolDelta`, `paths_of`) and a lifted helper. The `drift.*` surface stays user-facing; auto-sync invariants from task-27.1.6 are preserved.
- **#7 Tests** — one fixture per delta class (add / remove / body-modify / rename-relocate / comment-no-op) plus the membership-drift-in-isolation and symbol-not-file scoping cases in `reconcile_delta.test.ts`, and a focused `compute_symbol_delta` unit suite.

## Cost posture (AC#5)

The symbol delta sharpens what reconcile does **downstream** of the Ariadne index; it does not change the index build. Each `Stop`-hook run is a fresh `bin/drift_reconcile.ts` process, and `HeadlessProject.initialize` rebuilds the entire call graph from scratch (the uncached full-repo index flagged in task-27.1.6.1). The delta is computed *after* that index exists, by diffing the fresh extraction of the changed files against the store's persisted anchors. What it saves is therefore strictly downstream work: spurious whole-flow re-syncs off an unrelated edit in a shared file, needless re-describes of unchanged or relocated members (each a model call under a real executor), and flow writes / `last_synced_at` churn on no-op edits.

**Index incrementality is a named follow-up, out of scope here.** Persisting Ariadne's incremental `Project` (`update_file`/`remove_file` with dependent tracking) across runs requires either a long-lived daemon or serialize/deserialize of the `Project` state, neither of which Ariadne exposes today. Because the bin is a fresh process per turn, that incrementality is discarded by construction; recovering it is a larger change (a persistent index cache or reconcile daemon) tracked against the task-27.1.6.1 cache-cost note, not landed here. This task's downstream scoping is independent of and composable with a future index cache.

## Notes and known limitations

- **`added` is relative to anchored knowledge.** A symbol with no persisted anchor (an existing-but-undescribed function) reads as `added`, not only freshly-written code. This is harmless: downstream work is scoped through flows, so a symbol in no flow drives nothing, and it is the membership-drift trigger — not the `added` bucket — that pulls a new member into the flow it joined.
- **Method-level membership drift under D-FLOW-IDENTITY.** The flow layer's `symbol_path` (`flow_id_of`) is enclosing-free, so two same-named, same-kind methods on different classes in one file collapse to one path. The membership-drift trigger inherits this pre-existing limitation (a method-only add/remove that collapses onto an already-present path can be missed). This is the documented D-FLOW-IDENTITY constraint, not introduced here; top-level symbols (the common case) are unaffected.

<!-- SECTION:NOTES:END -->
