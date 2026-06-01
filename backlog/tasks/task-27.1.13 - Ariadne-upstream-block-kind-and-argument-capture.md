---
id: TASK-27.1.13
title: "Ariadne upstream (optional precision add-on): block-kind/condition-text + argument capture"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - ariadne
  - upstream
  - flowchart
  - deferred
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **Optional precision add-on — work executed in the SEPARATE `ariadne` repo.** **Not** a prerequisite for the key-control-flow agent (task-27.1.7): that skill infers control-flow structure from source via the agentic pass with zero ariadne change. This task lets a _deterministic_ extractor populate the same fields at higher confidence. Upstream cross-repo work on its own cadence; low priority.

An optional precision enhancer for the key-control-flow agent (task-27.1.7). Confirmed absent in ariadne today: all control-flow scopes collapse to `type: 'block'` (the if/for/while/try kind, condition text, and sibling-branch linkage are erased during scope processing), and `CallReference` carries no argument text.

This task extends ariadne so code-charter can derive intra-flow control-flow structure and data-flow annotations deterministically:

- `LexicalScope` gains `block_kind`, `condition_text`, and `sibling_scope_ids`.
- `CallReference` gains `argument_texts` for data-flow annotation.

Normal new fields populated for the relevant nodes (ariadne is under the same NO-BACKWARDS-COMPATIBILITY constitution — not optional/null-padded back-compat fields).

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 `LexicalScope` preserves the control-flow block kind and condition text instead of collapsing to a generic `block`
- [ ] #2 Sibling branches (if/else-if/else, try/catch/finally) are linked so a consumer can render alternative branches
- [ ] #3 `CallReference` exposes per-call-site argument texts sufficient for argument→parameter data-flow mapping
- [ ] #4 When present, the extension is consumable by task-27.1.7 as a deterministic, higher-confidence source for block-kind/condition-text — the key-control-flow agent does **not** depend on it (data-flow arm may land separately — see D-ARIADNE-SPLIT)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-ARIADNE-GATE (resolved):** the key-control-flow agent (task-27.1.7) is **not** gated on this; control-flow structure is agent-inferred today, ariadne is a precision/determinism upgrade.
- **D-ARIADNE-OWNERSHIP — who drives the optional upstream PR, and when?** code-charter drives it opportunistically · leave it to land in ariadne independently.
- **D-ARIADNE-SPLIT — one ariadne task or two?** one (block + argument capture) · two (block annotations gate flowchart structure; argument capture gates only data-flow — independent, can land later).

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
