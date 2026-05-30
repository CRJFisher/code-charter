---
id: TASK-27.0
title: "The shared custom graph model"
status: To Do
assignee: []
created_date: "2026-05-29"
labels:
  - architecture
  - ariadne
  - graph-db
  - consistency
dependencies:
  - task-27
  - task-21.1
parent_task_id: TASK-27
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The single shared foundation under both directions of Diagram-Driven Development. Everything else splits cleanly into code→diagram (task-27.1) and diagram→code (task-27.2); this is the one model they both operate on.

The model is a **custom graph layered over the Ariadne-derived graph**: it draws individual code symbols (functions, files, docs) into a bigger, more connected, higher-level picture of the repo, and it survives code change. "Survives code change" is the hard part and the reason this is a deliberate, persistent model rather than a view regenerated from code on demand.

Realized on `task-21.1`'s persistent store. This task owns the data model and the anchoring; the two directions own everything else.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The graph has two layers: a **derived layer** (Ariadne code edges + literal doc/frontmatter edges, with provenance) that is disposable and rebuilt from code, and a **custom layer** (higher-level/aggregating nodes, descriptions, groupings, inferred-edge adjudications) that is preserved
- [ ] #2 A custom-layer field survives a rebuild of the derived layer without being re-typed — field-granularity watermarking means a rebuild writes only derived-owned fields
- [ ] #3 Custom content attaches to code elements via stable **anchors** (symbol path + content hash), not line numbers or names, so it follows a renamed or moved element
- [ ] #4 A single reusable **resolver** maps an anchor to its current code state (the `{symbol_path, content_hash, span_hash}` tuple); both directions call it — task-27.1 to detect/repair drift, task-27.2 to snapshot and re-validate proposals
- [ ] #5 Custom content is never hard-deleted (soft-delete with restore); when an anchor cannot resolve, the content is preserved for re-attachment and never auto-pruned (the repair UX itself is task-27.1)
- [ ] #6 The model reserves the open shapes that keep the two directions additive — a per-table preserved/disposable tag, open-valued provenance fields, and an open ordered layer list in `render()` — so task-27.1 and task-27.2 add no schema migration

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

### A. Two layers over one store

- Realized on `task-21.1` (`GraphStore` interface, node id = `(file_path, anchor?)`, non-optional edge provenance, content-hash invalidation primitives). Nothing here binds to SQLite directly.
- **Derived layer (disposable):** Ariadne code edges + literal doc/frontmatter edges, each with provenance (`source_file`, `source_range`, `extractor_id`, `confidence`). Rebuilt from scratch when code changes — it holds no irreplaceable state.
- **Custom layer (preserved, append-only):** the higher-level and aggregating nodes that group the derived graph into a connected picture, plus human- and agent-authored descriptions, groupings, and inferred-edge accept/reject adjudications. This layer is what turns a raw call graph into something comprehensible, and it is the thing that must never be lost.
- `diagram = render(layers)` composes the layers. The layer list is **open and ordered**, so a later "proposed" overlay (task-27.2) is one more layer, not a signature change.

### B. Preservation — custom content is never lost

- **Field-granularity watermarking:** custom-owned fields are watermarked; a derived-layer rebuild writes only derived-owned fields, so a watermarked field is never clobbered. (Some fields are dual-sourced — e.g. a node `description` has a generated default in the derived layer that a user edit watermarks as custom-owned.)
- **Soft-delete with restore:** every user-visible destructive op sets a `deleted_at` flag; there is no hard DELETE on custom content.
- **Rebuild policy:** a schema-version mismatch nukes and rebuilds only the disposable derived layer; the custom layer and git-tracked JSON sidecars are the recovery source. Whether a table/field is disposable or preserved is an **explicit per-table property** the rebuild routine consults — not a hard-coded name list — so new preserved tables (e.g. task-27.2's pending-edit queue) declare themselves without reworking the rebuild logic.

### C. Anchoring — custom content survives code edits

- Custom content references code elements by **anchor** = symbol path + content hash, never a line number or a bare name — so a description follows a renamed function without re-typing.
- A single reusable **resolver** maps an anchor to its current code state, returning the `{symbol_path, content_hash, span_hash}` tuple. This resolver is the one place both directions genuinely share: task-27.1 calls it to detect drift and re-attach custom content; task-27.2 calls it to snapshot a proposal's base state at propose time and to re-validate at apply time.
- The resolver reports a clean hit, a downgrade (the element moved/renamed but is still resolvable), or a miss. What to _do_ with a downgrade or miss — surface it for review, hold it in a re-attachment bin — is task-27.1's repair policy; the model only guarantees the content is preserved until then.

### D. Open shapes reserved for both directions

The store's no-migration policy (nuke-and-rebuild only, never `ALTER`) means the shapes the two directions will need must be reserved here, not widened later:

- Custom rows carry an open-valued `origin` (which producer wrote the row) and `intent_source` (whose intent it reflects — `code-edit | diagram-edit | explicit-pin`). task-27.1 only ever writes `code-edit`/`code-change`; task-27.2 fills the rest. Unused values are reserved, not added by a later constraint change.
- The render layer list is open and ordered (see A).
- The resolver returns the full state tuple (see C) even when a given caller uses only part of it.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
