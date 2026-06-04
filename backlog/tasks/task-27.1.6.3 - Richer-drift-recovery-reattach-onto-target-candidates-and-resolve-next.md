---
id: TASK-27.1.6.3
title: "Richer drift recovery: reattach-onto-new-target, candidate suggestions, kind disambiguator, resolve-next"
status: Done
created_date: "2026-06-04"
assignee: []
labels:
  - drift
  - mcp
  - ux
  - resolver
parent_task_id: TASK-27.1.6
dependencies:
  - task-27.1.6
  - task-27.1.6.1
references:
  - backlog/tasks/task-27.1.6.1 - Drift-MCP-tool-ergonomics-try-out-and-review.md
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The `drift.*` recovery surface recovers two kinds of stranding well: a **relocation** (a rename with an unchanged body) is staged and committed onto the renamed symbol via `drift.resolve {reanchor}`, and a **miss** (the anchor resolves nowhere) is binned and restored onto its original anchor via `drift.resolve {reattach}`. The gap is the case between them: a description whose symbol is genuinely gone, where the user knows the *right new* symbol but the tool cannot get them there. `reattach` only un-deletes onto the now-absent original anchor; it never re-points stranded content onto a different symbol, and `drift.list` offers no candidate targets to choose from. The task-27.1.6.1 ergonomics review (AC#3) keeps the surface and defers this richer recovery here.

This task extends the same two MCP tools and the same recovery loop — it is one coherent unit of work on the surface:

- **Reattach-onto-new-target:** `drift.resolve` can bind stranded content to a chosen new symbol (an anchor that resolves today), not only un-delete onto the old one.
- **Candidate suggestions:** `drift.list` entries carry ranked candidate targets (same file, anchor/semantic similarity) so a chooser can pick a target without separately hunting for it.
- **`kind` disambiguator:** `drift.resolve` addresses a node vs an edge explicitly, removing the reliance on the unenforced node-id/edge-key disjointness the current `id`-only lookup rests on.
- **Resolve-next:** a loop affordance to walk the outstanding bin entries one at a time.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 **Reattach-onto-new-target:** `drift.resolve` accepts a target symbol and binds the stranded content's anchor to it, carrying the user-authored fields across; the bare single-argument `reattach` (restore onto the original anchor) still works
- [x] #2 **Candidate suggestions:** `drift.list` entries carry a ranked `candidates[]` of plausible new targets (e.g. same file, anchor/semantic similarity) so a chooser can pick a target from the listing alone
- [x] #3 **`kind` disambiguator:** `drift.resolve` addresses a node vs an edge unambiguously rather than recovering the kind by an `id`-only `find` over a disjointness assumption
- [x] #4 **Resolve-next affordance:** a loop primitive to walk outstanding bin entries one at a time
- [x] #5 **Invariants hold:** the surface stays user-facing-only (no reconcile-via-MCP creep — reconciliation remains the `Stop`-hook → sub-agent → `drift-sync` path) and additive to task-27.0's reservations (no new table, no schema migration)
- [x] #6 **Tests:** colocated tests cover reattach-onto-target, candidate ranking, and `kind`-disambiguated addressing

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Extend `drift_resolve` (`packages/drift/src/mcp/drift_tool.ts`) with an optional target symbol and a `kind` disambiguator; re-anchor the stranded node onto the chosen target via the resolver/`reanchor_node` path, carrying user-owned fields across.
2. Extend the bin query (`packages/drift/src/mcp/re_attachment_bin.ts`) to compute ranked candidate targets per entry from the current resolver index.
3. Add a resolve-next affordance (e.g. `drift.resolve` returning the next outstanding entry, or a `drift.next`).
4. Update the MCP tool schemas/descriptions (`build_drift_server.ts`) and the dogfooding walkthrough.
5. Colocated tests for each new capability.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

**Why this exists.** The `drift.*` recovery surface handles two strandings well: a relocation (a rename with an unchanged body) commits onto the renamed symbol via `drift.resolve {reanchor}`, and a miss whose symbol is simply gone restores onto its original anchor via `drift.resolve {reattach}`. The gap is the case between them — a description whose symbol is genuinely gone and the user knows the *right new* symbol — which the surface could not reach. This task closes that gap and rounds out the recovery loop, extending the same two MCP tools (and adding one) rather than introducing a new surface.

**The approach.** Four capabilities ride on the existing `drift_list` / `drift_resolve` handlers plus a new read-only `drift_next`, all computed purely from the `GraphStore` so the surface stays user-facing-only and the `NullGraphStore` degrades to empty/no-op with no branching. The load-bearing design decision is where "the live symbols that resolve today" come from: the raw code tier is **never persisted** (it is the in-memory call graph, regenerated each reconcile), so candidate targets and reattach destinations are read from the symbols' **persisted side-content** — the `agentic.description` side-nodes and flow nodes, whose anchors carry the current `symbol_path:content_hash`. Targets are therefore drawn from *all* live anchored nodes (deduped by `symbol_path`), and a reattach target is resolved by matching a live node's `symbol_path`, never by a node-id lookup.

**What it builds.**

- **Reattach-onto-new-target** — `drift_resolve` takes an optional `target` symbol_path; on a `reattach` it validates the target against the live anchored symbols, restores the binned node, and re-anchors it onto the target via `reanchor_node`, carrying the authored `description` and its `user` ownership across untouched. Bare `reattach` (no target) still restores onto the original anchor.
- **Candidate suggestions** — `drift_list` entries carry a ranked `candidates[]` from the pure core function `rank_candidates`, scoring each live anchored symbol by content-hash match (+100), same defining file (+10), and same leaf-name+kind (+5); the gaps guarantee the strongest single signal outranks any sum of weaker ones, ties break on `symbol_path`, and the list is capped at five.
- **`kind` disambiguator** — `drift_resolve` now requires `kind` (`node`/`edge`), addressing the target's space explicitly and replacing the `id`-only `find` that rested on an unenforced node-id/edge-key disjointness assumption.
- **Resolve-next** — a read-only `drift_next` tool returns the head of the bin (or `null`), with the bin ordered deterministically by `(deleted_at, id)` so `drift_list` and `drift_next` agree on "the next entry."

**How to navigate.** The recovery handlers are `packages/drift/src/mcp/drift_tool.ts` (`drift_resolve` + `reattach_onto_target` + `drift_next`); the bin query, the live-target enumeration, and the cheap size count are `re_attachment_bin.ts`; the pure ranker is `packages/core/src/resolver/rank_candidates.ts`; the MCP schemas/descriptions are `build_drift_server.ts`. Discoverability lives in `packages/drift/src/hooks/session_start_banner.ts` (which now fires on a non-empty bin, not only on relocations) and the copy-paste loop in `packages/drift/assets/dogfood-drift-recovery.md`.

**What to know / watch.** `delete` keeps a never-auto-pruned tombstone in the bin (per task-27.0's preservation guarantee), so only `reattach` drains the `drift_next` loop — the walkthrough says so. A bin entry's `id` (an opaque key like `user:description:calc`) and a candidate `symbol_path` (a code symbol) are different id-spaces. The `content-match` candidate tier rarely fires for a genuine miss (a binned symbol's body matches no live symbol by construction); same-file / name-match carry the common rename-and-rewrite case. The candidate/target source is the persisted anchored side-content, so a symbol with no diagram side-node is not yet offered as a target — acceptable for v1, and a natural extension point.

### Acceptance criteria outcomes

- **#1** — `reattach` with a `target` re-points a binned description onto the chosen live symbol (validate target → restore → `reanchor_node`), preserving the authored text + `user` ownership; bare `reattach` still restores onto the original anchor. Both are tested, including against an `agentic.description` target (the real persisted shape).
- **#2** — `drift_list` entries carry a ranked `candidates[]` from `rank_candidates`, drawn store-only from live anchored symbols.
- **#3** — `drift_resolve` requires `kind`; the lookup is kind-scoped, so a colliding node id / edge key each resolve to the right space and a wrong-space `kind` is a clean no-op.
- **#4** — `drift_next` walks the bin one entry at a time in `(deleted_at, id)` order, agreeing with `drift_list[0]`; `null` terminates.
- **#5** — surface stays user-facing-only (no Ariadne, no resolver index, no reconcile path on the MCP layer) and additive to task-27.0 (no new table, no migration — every new field reads off existing rows); `NullGraphStore` degrades to empty/no-op with no branching.
- **#6** — colocated tests cover candidate ranking (`rank_candidates.test.ts`, `re_attachment_bin.test.ts`), reattach-onto-target + bare reattach (`drift_tool.test.ts`), `kind`-disambiguated addressing, and the `drift_next` loop.

<!-- SECTION:NOTES:END -->
