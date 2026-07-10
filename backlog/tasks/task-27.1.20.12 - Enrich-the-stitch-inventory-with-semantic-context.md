---
id: TASK-27.1.20.12
title: Enrich the stitch inventory with semantic context
status: Done
assignee: []
created_date: "2026-07-05 13:52"
labels:
  - drift
  - agentic
  - quality
dependencies:
  - TASK-27.1.20.10
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

[HIGH — the agentic layer is under-fed] build_entrypoint_inventory emits only symbol_path/name/file/line/is_orphan/unresolved_sites per entrypoint, discarding the member names, docstrings, and existing description nodes its reachable_from walk already touches. Stitching is a semantic-similarity judgement, yet the agent gets zero semantic signal and must reconstruct everything via Read/Grep — exactly where the cost-tuned haiku default under-stitches, and under-stitching reads as "correct, no gap" (silent quality loss).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Extend InventoryEntrypoint in agentic_modes.ts with members: [{name, kind, docstring_first_line?}] from the existing reachable_from walk, plus each member existing description text where present
- [x] #2 Update SKILL.md phase-1 guidance to rank candidates by name/description similarity first, then confirm top candidates by reading the call site
- [x] #3 Report per-flow described-coverage (placeholder vs llm counts) in the list-entrypoints output

<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

Stitching is a semantic-similarity judgement, but the `--list-entrypoints` inventory used to hand the drift-reconciler agent only structural identity — so the cost-tuned haiku default reconstructed every candidate's meaning via Read/Grep, under-stitched, and the miss read as "correct, no gap". The inventory now carries the semantic signal its `reachable_from` walk already touches: each entrypoint lists its tree's `members` (`{ name, kind, docstring_first_line?, description? }`) and a `described_coverage` source split (`{ docstring, provisional, placeholder, llm }`), and the drift-sync skill's phase 1 ranks candidate pairs by member-vocabulary similarity before spending any reads — ranking is triage, never evidence; the call-site (or, for a site-less orphan, definition/reference) confirmation bar is unchanged.

Members are ranking signal, not a wire identity: they carry no symbol_path (seeds and bridges still address entrypoints), and a member's `description` surfaces only prior agent-authored (`llm`) text — docstring prose rides `docstring_first_line`, and a provisional/placeholder stand-in is the member's name, zero signal beyond `name` itself. Coverage is a store snapshot per entrypoint; an undescribed member appears in no bucket, so buckets can sum below the member count.

`build_entrypoint_inventory` (packages/drift/src/reconcile/agentic_modes.ts) owns the enrichment as a two-pass build: the existing tree walks collect member nodes by graph SymbolId (two same-named methods on different classes stay distinct members), then one batched `anchored_symbols` call over the union of member files — reachable trees span beyond the changed set — feeds the same two-id-space join `apply_descriptions` uses (symbol_id → anchor → enclosing-qualified anchor symbol_path → description node), so method descriptions resolve instead of silently dropping. `existing_descriptions` (describe.ts) now surfaces `description_source`. The wire shape and phase-1 guidance live in packages/drift/assets/skills/drift-sync/SKILL.md; behavior is locked by unit tests over the in-memory fixture (which now models docstrings and method definitions) and the e2e stitch goldens.

Known dormancy: the current Ariadne version populates `docstring: undefined` on every definition, so `docstring_first_line` never fires in production yet — the same upstream gap that keeps the describe policy's docstring bucket at zero. It lights up with no change here when Ariadne emits docstrings. gap_detection.ts needed no change (orphan detection and the over-large report are untouched); there is no member cap — the existing over-large stderr report is the cost signal.
<!-- SECTION:NOTES:END -->
