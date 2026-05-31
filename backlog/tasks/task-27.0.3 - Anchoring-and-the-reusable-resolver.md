---
id: TASK-27.0.3
title: "Anchoring and the reusable resolver"
status: To Do
assignee: []
created_date: "2026-05-30"
labels:
  - architecture
  - ariadne
  - graph-db
  - consistency
dependencies:
  - task-27.0.1
parent_task_id: TASK-27.0
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The single place a stored anchor becomes current code state — the one mechanism both directions genuinely share. Builds the resolver over the Ariadne `CodeGraph`, deriving a rename-stable, file-qualified `symbol_path` plus content and span hashes, and reports `hit` / `downgrade` / `miss` so preserved (agentic/user) content can follow a rename or move, or be held for re-attachment.

task-27.1 calls it to detect drift and re-attach content; task-27.2 calls it to snapshot a proposal's base state and re-validate at apply time. The resolver only **reports** — it never mutates and never decides policy. Its output (`anchor_resolution`) is a disposable cache, recomputed from code + anchors, never a source of truth — which is precisely why the diff/drift signal is derived rather than stored.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `ResolverIndex` is built once from an Ariadne `CodeGraph`; `resolve_anchor(anchor, index)` takes that index and an `Anchor` and returns a `ResolveResult` (types imported from `packages/types/src/graph_store.ts`). The `hit` and `downgrade` arms carry the full `CodeState` `{symbol_path, content_hash, span_hash}` (returned whole even when a caller uses only part); the `miss` arm is `{ status: 'miss' }` with no state
- [ ] #2 Resolution is an ordered cascade: (1) exact `symbol_path` + `content_hash` → `{status:'hit'}`; else (2) `symbol_path` matches but `content_hash` differs → `{status:'downgrade', reason:'body-changed'}`; else (3) `content_hash` matches at a different `symbol_path` → `{status:'downgrade', reason:'relocated'}` (whether renamed in place or moved across files); else (4) `{status:'miss'}` (covering a simultaneous rename + body-change)
- [ ] #3 `symbol_path` is location-free within a file but file-qualified, so a same-file rename resolves as a downgrade (not a miss) and a cross-file move is recoverable by `content_hash`
- [ ] #4 The resolver is pure — it performs no writes and consults no policy; `anchor_resolution` is a disposable cache of its output, recomputed on rebuild and never treated as authoritative
- [ ] #5 The resolver does not import `node:sqlite`; it operates on a CodeGraph/index and is unit-tested on fixtures covering hit / body-changed / relocated (both same-file rename and cross-file move) / miss, including two same-named symbols in one file resolving distinctly

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

Builds on `@code-charter/core` (task-27.0.1): the resolver and its `anchor_resolution` cache table (already created and tagged disposable) live in `@code-charter/core`; the resolver itself imports no `node:sqlite`.

1. Build `symbol_path` = `file_path` + qualified-name chain, where the chain (enclosing class/namespace) is reconstructed by walking Ariadne's enclosing-scope tree and the symbol kind is retained to separate overloads. Ariadne's `SymbolId` string itself encodes no qualified-name chain — two same-named methods on different classes in one file would otherwise collapse to one `symbol_path` — so it cannot be obtained by merely dropping line/column coordinates.
2. Compute a per-symbol `content_hash` = sha256 of the normalized body (leading/trailing whitespace trimmed and the symbol's own identifier excluded, so a pure rename keeps `content_hash` stable — the basis for the renamed-as-downgrade verdict) and `span_hash` = sha256 of the exact source bytes. `packages/vscode/src/storage/content_hash.ts` hashes at file granularity only; add per-symbol hashing following the same sha256 pattern. `span_hash` is reserved per task-27.0 plan D with no current consumer; it is **not** task-27.2's `referenced_span_hash`, which hashes a referenced prose span.
3. Build a `ResolverIndex` keyed by both `symbol_path` and `content_hash`. The stored anchor string is `symbol_path:content_hash`; since `content_hash` is a fixed-length hex sha256, the last colon-segment splits back unambiguously even though `symbol_path` itself contains colons, so task-27.0.1's stored anchor round-trips losslessly into an `Anchor`.
4. Implement `resolve_anchor` with the cascade in AC#2; cache results to `anchor_resolution` — a table created and tagged disposable by task-27.0.1; this task only populates/reads it, never altering its schema or disposition.
5. Fixture-based unit tests for each verdict (hit / body-changed / relocated — both same-file rename and cross-file move — / miss), including two same-named symbols in one file resolving distinctly.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
