---
id: TASK-27.1.6.2
title: "Fix re-sync mass-bin: anonymous symbol_paths collide and build_index empties the resolver index on any duplicate"
status: To Do
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

- [ ] #1 **No anonymous resolver symbols:** `resolver_symbols_from_ariadne` and `anchored_symbols_from_ariadne` skip callables with no stable name (e.g. `name === "<anonymous>"`), so they never emit colliding `<file>#<anonymous>:...` records and never produce descriptions for unaddressable callbacks
- [ ] #2 **`build_index` never empties on a duplicate:** a residual duplicate `symbol_path` anywhere in the file set must not collapse the whole resolver index to empty — dedup by `symbol_path` (deterministic, first-wins) before `build_resolver_index`, or build per-file and merge skipping a thrower, so every non-colliding symbol still resolves
- [ ] #3 **Re-sync preserves resolvable descriptions:** re-syncing a file that contains multiple anonymous callbacks does not soft-delete any `agentic.description` whose `symbol_path:content_hash` still resolves against the current code; only genuine relocations/misses are staged/binned
- [ ] #4 **Regression test:** a fixture file with ≥2 bodied anonymous functions (plus a named, described symbol) drives a re-sync and asserts (a) `build_index` returns a populated index, and (b) the named symbol's description survives (not binned)
- [ ] #5 No silent narrowing: if dedup drops a duplicate, it is logged/reported (never a silent cap), consistent with the rest of the engine

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

**Evidence (from the live dogfood run that found this):**

- Store after a 39-file re-sync: `agentic.description` total=29, live=4, soft-deleted (binned)=25; `re_attachment_bin` = 25 entries (e.g. `agentic.description:packages/vscode/src/ariadne/project_manager.ts#AriadneProjectManager.initialize:method` — a description whose symbol still exists).
- Diagnostic over the changed code files: `symbols: 115  distinct: 55  DUPLICATES: [ <file>#<anonymous>:function ×6 ]`, and `build_resolver_index THREW -> duplicate symbol_path … #<anonymous>:function`.

**Faulty code today** (`ariadne_adapter.ts` `build_index`): the inner `try` wraps the non-throwing `resolver_symbols_from_ariadne([input])`; the throwing `build_resolver_index(symbols)` sits in the outer `try` whose `catch` returns `build_resolver_index([])`.

**Related, out of scope here:** the call-graph layer legitimately includes `<anonymous>` *entry points*, so flow detection still emits small `…#<anonymous>:function` flows (deterministic v1 grouping noise). That is the agent-judged umbrella-grouping concern (27.1.7 territory), separate from this resolver/preservation fix — do not conflate.

<!-- SECTION:NOTES:END -->
