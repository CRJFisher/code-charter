---
id: TASK-27.2
title: "Diagram to code: describe-first authoring and apply"
status: To Do
assignee: []
created_date: "2026-05-29"
labels:
  - architecture
  - mcp
  - hooks
  - sub-agents
  - ui
  - consistency
dependencies:
  - task-27
  - task-27.0
  - task-21.1
  - task-27.1
parent_task_id: TASK-27
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
  - backlog/tasks/task-26 - Research-and-prototype-a-chart-diff-view-for-module-refactoring-and-generic-plan-visualization.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The diagram→code half of the Diagram-Driven Development capstone. Everything that flows **from the diagram to the code**: shaping the diagram by describing the change you want, having an agent restructure it, judging how actionable the resulting edit is, and applying the matching code change safely.

Serves `doc-5`'s "From the diagram to the code: describe-first". The primary surface is natural-language description, not hand manipulation; nothing touches the user's source until they accept a side-by-side diff.

Builds on the shared custom graph model (task-27.0): the diagram it edits, the anchor resolver it snapshots and re-validates against, and the preservation guarantees. Depends on task-27.1 for the comprehension map it edits and reuses task-27.1's diff-signal + triage + re-extraction entry point for its round-trip. This task also **owns authority/pin** — the arbitration between diagram-authoring and code-editing, which exists only here because that conflict cannot arise until the diagram can author change.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The primary authoring surface is natural-language: the user describes a layout/structure change and an agent restructures the diagram; direct manipulation (relabel / group / move by hand) is the secondary path and emits the same ops
- [ ] #2 Every emitted op is assessed for **actionability** before it surfaces — whether it maps to a concrete code change (and its blast radius) or is diagram-only — and arrives pre-classified with rationale
- [ ] #3 A diagram structural edit (rename / delete / group / move) always produces a reviewable proposal in the pending-edits queue and never writes source until the user accepts it in a side-by-side review
- [ ] #4 Accepting a change set applies edits to the working tree only (no auto-commit), triggers re-extraction of affected files, and re-anchors the user layer so customizations follow the changed elements
- [ ] #5 A stale proposal (the code moved underneath since the edit was queued) is detected at accept time and re-resolved or discarded — never misapplied
- [ ] #6 Both diagram→code writes are exposed as named, auditable MCP writes (`diagram.propose`, `user_layer.update`); adding a node routes to a coding-task prompt, not a `diagram.propose` op
- [ ] #7 After apply, divergence between the landed code and the proposed diagram state is written to the drift inbox (code→diagram) rather than hidden — the two directions compose
- [ ] #8 Authority over an element is computed from `intent_source`; an explicit pin overrides; agent edits executing a pin are derivative and do not reset authority (so a post-apply re-extraction does not reset what the user just authored). The current owner (code | diagram | pinned) is shown on the node and the user can pin/unpin to change it

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

### A. Describe-first authoring entry point

Serves `doc-5`'s "you shape the diagram mainly by describing the change you want."

- The primary surface is natural-language. The user describes a layout/structure improvement ("split this module", "group these into a service") and a **diagram-author sub-agent** restructures the diagram, emitting one or more `diagram.propose` ops.
- Direct manipulation (relabel / group / move by hand) is the **secondary** path and emits the same ops.
- Every emitted op then passes through the actionability assessment (section B) before it surfaces to the user.

### B. Actionability assessment

Serves `doc-5`'s "a second agent judges how actionable the resulting edit is."

- The drift-triage sub-agent (defined in task-27.1) is reused to assess each `diagram.propose` op's **actionability** before it surfaces — whether it maps to a concrete code change (and its blast radius) or is diagram-only (routed to `user_layer.update` instead of a code diff) — and to attach rationale, so a proposal arrives already classified and pre-justified. It runs as the distinct second stage after the diagram-author agent — doc-5's "a second agent judges how actionable the resulting edit is."

### C. MCP surface + change-set schema

Serves `doc-5`'s "review proposed code changes side-by-side." Diff-view prior art lives in task-26 (difference maps, Greene module-correspondence, Copilot 3-tier accept, move-detection, stable-layout anchoring).

- **MCP write:** `diagram.propose(op)` where `op = {kind: rename|delete|group|move, target_anchor, new_value, rationale?, origin: user|agent}`. It does not edit code; it **enqueues** a proposed op into the pending-edits queue, mirroring `drift.resolve` so both directions are named and auditable. **Add** is _not_ a `diagram.propose` op — a bare node has no spec, so add routes to a prompt panel that emits a normal coding task. `user_layer.update` handles cosmetic/diagram-only edits (description/color/pin) that make no code claim and never enter the queue; setting/clearing a pin through it is how the user changes which side owns an element (authority, section F). A regroup that maps to a real code boundary is realized as a `move` op; a pure regroup with no code boundary makes no code claim and likewise routes through `user_layer.update`, never `diagram.propose`.
- **Change-set schema (in the SQLite store):**
  - `pending_edit(id, change_set_id, kind, target_anchor, new_value, origin, rationale, status[queued|applied|rejected|stale], created_at, base_anchor_state)` — `base_anchor_state` snapshots `symbol_path + content_hash + referenced_span_hash` at propose time; this is what makes stale-detection possible at accept time.
  - `change_set(id, status[open|reviewing|applied|reverted])` groups pending edits into the unit the user reviews/reverts. Multiple diagram edits before review simply append `pending_edit` rows to the open change set.
  - Targets stored as **anchors, not node ids**, so a proposal survives re-extraction churn until accepted.
  - `pending_edit` / `change_set` are new preserved tables (they declare themselves preserved via task-27.0's per-table tag, so nuke-and-rebuild never wipes them) persisted in the WAL-backed store (task-21.1) immediately on enqueue — so a half-built change set from an interrupted authoring session survives process restart/crash and is recoverable on next session open.

### D. Side-by-side diff rendering

- **v1 (practical):** generate the concrete code edit per op eagerly at review time and render a two-pane per-file text diff (rename runs LSP rename if available, else Ariadne reference set → textual rewrite; affected-file set comes from incident edges on the target anchor). Whole-change-set accept/reject; revert-all. For a delete op, the diff foregrounds the breaking call sites (incident references that would no longer resolve) ahead of the symbol removal itself, so the blast radius is the first thing the user reviews — matching doc-5's "for a delete, the breaking call sites first."
- **Ideal (later):** layer in-diagram difference-map styling from task-26 (proposed nodes dashed + reduced opacity + distinct hue, moves shown as paired-color move encoding not delete+add, stable layout via elkjs pinning before-positions; React Flow node data gains `diffStatus`/`provenance`); per-operation accept + piecemeal revert (Copilot 3-tier granularity).
- **Surface:** the pending-edits review panel is triggered when `diagram.propose` queues an op — preview-and-confirm. It leads with the op kind, rationale, and blast radius from the actionability assessment (section B), so acceptance is at the intent level — the per-file text diff is the drill-down, not the primary read. This keeps the loop "direct change as intent rather than as diffs" even in v1, where the in-diagram difference-map styling is still deferred.

### E. Apply mechanics + stale guard

- **Apply (accept):** re-validate each op's `base_anchor_state` against current code (resolve anchor again, compare hashes). Match → apply; diverged → mark `stale`, surface re-resolve-or-discard, never apply. **This stale guard is the single most important correctness mechanism in this direction.** Apply writes to the working tree only (never auto-commits): rename = symbol + reference rewrite; delete = soft-delete then remove symbol + user-reviewed incident references; move = relocate + import fixups. v1 applies the whole change set atomically.
- **Round-trip:** after apply, trigger re-extraction of affected files through task-27.1's single re-extraction entry point with `origin=apply` (content-hash keyed); the derived layer rebuilds, `render()` recomputes, and the custom layer re-anchors via task-27.0's resolver. Because the re-extraction is tagged `origin=apply`, authority is not reset on the elements the user just authored (section F). A custom-layer item that fails to re-anchor is preserved (task-27.0) and surfaced in task-27.1's re-attachment bin, recoverable and never auto-deleted. If the landed code differs from the proposed diagram state, write a row to the drift inbox (code→diagram, task-27.1) rather than hiding it — the queues compose.
- **Revert:** v1 revert-all discards the open change set's `pending_edit` rows and re-renders (proposed edits are tracked separately, not yet written into either layer, so no destructive undo is needed). Piecemeal revert (delete individual rows) is deferred — the row-per-op schema already supports it.

### F. Authority & pin

Serves `doc-5`'s "authority follows where you keep editing it." Authority lives here, not in the shared model or in task-27.1, because it arbitrates between diagram-authoring (this task) and code-editing — a conflict that cannot arise until the diagram can author change.

- **Computed from where intent lands:** every custom element carries `intent_source` (`code-edit | diagram-edit | explicit-pin`) plus a timestamp — the field reserved by task-27.0. Authority follows it: the diagram if you keep shaping it there, the code if you keep changing it there.
- **Claim rules:** a diagram edit to an extractor-relevant field claims diagram-intent; a code edit to a diagram-relevant aspect claims code-intent; an agent edit executing a prior pin is marked **derivative** and does not reset authority. This is why the post-apply re-extraction (task-27.1, `origin=apply`) leaves authority intact on the elements the user just authored.
- **Pin:** `user_layer.update` sets `intent_source = explicit-pin` ahead of time, so a later code change is treated as drift against a deliberate decision rather than overwriting it.
- **See and change ownership:** selecting a node shows its current owner (code | diagram | pinned); pin/unpin through `user_layer.update` changes which side owns it. This is the read+write surface for authority that task-27.1 deliberately omits.
- **Simultaneous edits:** when the user and an agent touch the same element at once, the pin and the most-recent intentful edit arbitrate.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
