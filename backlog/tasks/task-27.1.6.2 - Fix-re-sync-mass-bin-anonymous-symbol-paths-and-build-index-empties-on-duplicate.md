---
id: TASK-27.1.6.2
title: "Fix re-sync mass-bin: anonymous symbol_paths collide and build_index empties the resolver index on any duplicate"
status: Done
assignee: []
created_date: "2026-06-04"
labels:
  - bug
  - drift
  - resolver
  - preservation
  - graph-db
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.6
references:
  - backlog/tasks/task-27.1.6 - Per-flow-auto-sync-and-edit-preservation.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

A live re-sync of a real repo soft-deletes **valid, current** `agentic.description` side-nodes into the re-attachment bin — preservation churn that should never happen. In the dogfood run that surfaced it, 25 of 29 descriptions were binned in one re-sync of unchanged-meaning code. The data is recoverable (it is in the bin, not lost), but re-sync must not strand content whose anchor still resolves.

The fault is a two-step chain, both in the code→diagram preservation path:

1. **Anonymous callables collide in `symbol_path` space.** `resolver_symbols_from_ariadne` (and its sibling `anchored_symbols_from_ariadne`) emit one record per anchorable callable-with-a-body, including anonymous functions, each keyed `<file>#<anonymous>:function`. A file with two or more bodied anonymous callbacks therefore produces **duplicate `symbol_path`s**. An unnamed callback has no stable, addressable identity, so it should not be a resolver symbol or carry a description at all.

2. **`build_index` empties the whole index on any duplicate.** `build_resolver_index` throws on a duplicate `symbol_path` (a deliberate "indistinguishable symbols" guard). `packages/drift/src/reconcile/ariadne_adapter.ts`'s `build_index` means to isolate that per file but does not: its inner `try` wraps `resolver_symbols_from_ariadne` (which never throws), while the real throw is `build_resolver_index(symbols)` in the **outer** `try`, whose `catch` returns `build_resolver_index([])` — an **empty index**. `re_extract` then resolves every preserved, anchored description against the empty index, gets `miss` for all of them, and soft-deletes the lot into the bin.

This is the unimplemented half of task-27.1.6's review finding C ("one pathological file empties the whole index → re_extract mass-soft-deletes every preserved description"): the committed `build_index` *describes* a per-file skip in its comment but does not actually do it, and the test suite never exercised a file with multiple anonymous callbacks, so it shipped green.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 **No anonymous resolver symbols:** `resolver_symbols_from_ariadne` and `anchored_symbols_from_ariadne` skip callables with no stable name (e.g. `name === "<anonymous>"`), so they never emit colliding `<file>#<anonymous>:...` records and never produce descriptions for unaddressable callbacks
- [x] #2 **`build_index` never empties on a duplicate:** a residual duplicate `symbol_path` anywhere in the file set must not collapse the whole resolver index to empty — dedup by `symbol_path` (deterministic, first-wins) before `build_resolver_index`, or build per-file and merge skipping a thrower, so every non-colliding symbol still resolves
- [x] #3 **Re-sync preserves resolvable descriptions:** re-syncing a file that contains multiple anonymous callbacks does not soft-delete any `agentic.description` whose `symbol_path:content_hash` still resolves against the current code; only genuine relocations/misses are staged/binned
- [x] #4 **Regression test:** a fixture file with ≥2 bodied anonymous functions (plus a named, described symbol) drives a re-sync and asserts (a) `build_index` returns a populated index, and (b) the named symbol's description survives (not binned)
- [x] #5 No silent narrowing: if dedup drops a duplicate, it is logged/reported (never a silent cap), consistent with the rest of the engine

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Root cause — `packages/core/src/resolver/from_ariadne.ts`:** in the shared `walk_callables` traversal (consumed by both `resolver_symbols_from_ariadne` and `anchored_symbols_from_ariadne`), skip a callable whose `name` is the anonymous sentinel (`<anonymous>`). These have no rename-stable identity, so excluding them removes the duplicate `symbol_path`s at the source and stops pointless `<anonymous>` descriptions. Confirm the exact sentinel Ariadne emits.
2. **Defense — `packages/drift/src/reconcile/ariadne_adapter.ts` `build_index`:** dedup the accumulated `ResolverSymbol[]` by derived `symbol_path` (first-wins, deterministic order) before calling `build_resolver_index`, so a duplicate can never reach the throwing path and empty the index. Log any drop. Remove the misleading "index file-by-file and skip a thrower" comment/structure that never worked.
3. **Test:** add a colocated fixture + test (`packages/drift/src/reconcile/*.test.ts`, or core resolver test) exercising AC#3/#4 — multiple anon callbacks in one re-synced file, assert the index is populated and a named description is preserved.
4. **Verify:** re-run the live reconcile over a repo whose changed set includes such a file; confirm `re_attachment_bin` no longer fills with valid descriptions.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

A per-flow re-sync must never strand content whose anchor still resolves. In practice it did: re-syncing unchanged-meaning code soft-deleted valid, current `agentic.description` side-nodes into the re-attachment bin (25 of 29 in the dogfood run that surfaced it). The cause was a two-hop chain in the code→diagram preservation path — anonymous callables collided in `symbol_path` space, and that collision then emptied the entire resolver index.

The fix closes the chain at both points. At the source, the shared `walk_callables` traversal in `packages/core/src/resolver/from_ariadne.ts` excludes Ariadne's `<anonymous>` sentinel, so neither `resolver_symbols_from_ariadne` nor `anchored_symbols_from_ariadne` emits an unaddressable, colliding record (and no `<anonymous>` carries a description). As defense-in-depth, `build_index` in `packages/drift/src/reconcile/ariadne_adapter.ts` now dedups resolver symbols by derived `symbol_path` (first-wins) through the new `build_dedup_index` **before** `build_resolver_index`, so a residual duplicate can never reach the throw that previously collapsed the index to empty. Both halves are kept because either alone resolves the mass-bin, and together they make the failure unreachable rather than merely unlikely.

Three moving parts changed. `walk_callables` gained a `visit_named` chokepoint that drops the anonymous sentinel for every emitter at once. `build_index` no longer wraps the index build in a throw-swallowing `try/catch`; it dedups first and routes through `build_dedup_index`. And every dropped duplicate is reported through a now-**required** `log` sink on `make_ariadne_adapter(project, log)` — no silent narrowing — which the production bin wires to stderr.

To navigate: `from_ariadne.ts` owns the source exclusion (the `ANONYMOUS_NAME` skip in `walk_callables`); `ariadne_adapter.ts` owns the dedup defense and the log seam (`build_dedup_index`); `re_extract.ts` is the consumer that resolved preserved descriptions against the index and binned the misses. The regression lives in `packages/drift/src/reconcile/ariadne_adapter.test.ts` with fixture `__fixtures__/anon_collide/module_with_anons.ts`.

To watch: the call-graph layer still legitimately includes `<anonymous>` *entry points* (see the scope note below) — this fix touches only the resolver/anchor path, not flow detection. A residual *named* duplicate `symbol_path` is a derivation defect that should not occur; if one ever does, `build_dedup_index` keeps the first and logs the drop loudly for investigation rather than capping silently.

## Implementation details

- **Source exclusion (AC#1)** — `from_ariadne.ts` adds `const ANONYMOUS_NAME = "<anonymous>"` (the exact sentinel Ariadne's `anonymous_function_symbol` emits) and a `visit_named` wrapper inside `walk_callables` that returns early on `def.name === ANONYMOUS_NAME`. Placing the guard at the single shared traversal seam covers both `resolver_symbols_from_ariadne` and `anchored_symbols_from_ariadne` with one check; exact equality (not a substring test) keeps a user symbol named like `parse_anonymous` from being skipped.
- **Dedup defense (AC#2, AC#5)** — `ariadne_adapter.ts` adds `build_dedup_index(symbols, log)`, which keys each symbol by `build_symbol_path(...)` — the same key `build_resolver_index` derives internally via `derive_code_state`, so the two cannot disagree — keeps the first occurrence, logs each drop, and only then calls `build_resolver_index`. The previous misleading per-file `try` (around the non-throwing `resolver_symbols_from_ariadne`) and the outer `catch` that returned `build_resolver_index([])` are removed.
- **Log plumbing (AC#5)** — `make_ariadne_adapter` takes a **required** `log: (message: string) => void`. A required parameter makes "no silent narrowing" a compile-time guarantee at every call site; the production bin (`drift_reconcile.ts`) hoists one stderr sink and shares it with both the adapter and `reconcile`. The three reconcile test call sites pass a no-op.
- **Regression (AC#3, AC#4)** — fixture `module_with_anons.ts` carries two top-level block-bodied anonymous callbacks (which collide) plus a named, bodied `named_thing`. The test asserts: (guard) the raw Ariadne index really contains ≥2 bodied `<anonymous>` callables, so the regression stays meaningful even though the resolver now skips them; (4a) `build_index` returns a populated index of exactly the one named symbol, with no `<anonymous>` record; (4b) a description anchored to `named_thing` survives a real `re_extract` re-sync and is not binned; (AC#5) `build_dedup_index` keeps the first of two colliding records and logs the drop. The test was confirmed RED against both reverted fixes before landing.

**Evidence (from the live dogfood run that found this):**

- Store after a 39-file re-sync: `agentic.description` total=29, live=4, soft-deleted (binned)=25; `re_attachment_bin` = 25 entries (e.g. `agentic.description:packages/vscode/src/ariadne/project_manager.ts#AriadneProjectManager.initialize:method` — a description whose symbol still exists).
- Diagnostic over the changed code files: `symbols: 115  distinct: 55  DUPLICATES: [ <file>#<anonymous>:function ×6 ]`, and `build_resolver_index THREW -> duplicate symbol_path … #<anonymous>:function`.

**Related, out of scope here:** the call-graph layer legitimately includes `<anonymous>` *entry points*, so flow detection still emits small `…#<anonymous>:function` flows (deterministic v1 grouping noise). That is the agent-judged umbrella-grouping concern (27.1.7 territory), separate from this resolver/preservation fix — do not conflate. The `Stop`-hook trigger UX (firing for non-flow files) is captured in task-27.1.6.1.

**Known, pre-existing (not introduced here):** `@ariadnejs/core` accumulates parser state across `Project` instances within a single process, so running the drift suite with `--runInBand` (one process for all files) flakes — confirmed on the base with none of this task's changes. Under the default parallel jest config the suite is stable; this task's regression test keeps a minimal footprint (one shared `HeadlessProject` for the file) to avoid perturbing that.

<!-- SECTION:NOTES:END -->
