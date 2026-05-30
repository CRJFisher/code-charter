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

The model is a **custom graph layered over the Ariadne-derived graph** in three tiers, split by **cost of regeneration**: it draws individual code symbols (functions, files, docs) into a bigger, more connected, higher-level picture of the repo, and it survives code change. "Survives code change" is the hard part and the reason this is a deliberate, persistent model rather than a view regenerated from code on demand.

| Tier | Contents | Rebuild cost | On re-parse |
|---|---|---|---|
| **L0 raw** | parse, symbols, call/import edges, literal doc edges | free, deterministic | **nuke & rebuild** |
| **L1 agentic** | behaviour descriptions, groups, inferred edges | expensive, non-deterministic (LLM) | **preserve** |
| **L2 user** | labels, pins, positions, manual descriptions, adjudications | irreplaceable | **preserve** |

Only the **raw** tier is disposable. The **agentic** tier is preserved across a re-parse not because a human authored it, but because regenerating it costs LLM time and is non-deterministic — re-running it would burn tokens and produce a different map; it is rebuilt only on an explicit, run-when-asked agentic pass, never silently on code change. The **user** tier is irreplaceable. Both preserved tiers attach to code via anchors so they follow renames and moves.

Realized on `task-21.1`'s persistent store. This task owns the data model and the anchoring; the two directions own everything else.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The graph has three tiers split by cost-of-regeneration — **raw** (Ariadne code edges + literal doc/frontmatter edges, with provenance), **agentic** (higher-level/aggregating nodes, behaviour descriptions, groupings, inferred edges), and **user** (labels, pins, positions, manual descriptions, inferred-edge adjudications) — composed by an **open, ordered layer list**; only **raw** is disposable and rebuilt from code, while **agentic** and **user** are preserved
- [ ] #2 A preserved-tier field survives a rebuild of a lower tier without being re-typed — field-granularity watermarking follows the precedence ladder `user > agentic > raw`, so a raw re-parse writes only raw-owned fields and an explicit agentic pass writes raw- and agentic-owned fields but never user-owned
- [ ] #3 Agentic and user content attaches to code elements via stable **anchors** (symbol path + content hash), not line numbers or names, so it follows a renamed or moved element
- [ ] #4 A single reusable **resolver** maps an anchor to its current code state (the `{symbol_path, content_hash, span_hash}` tuple); both directions call it — task-27.1 to detect/repair drift, task-27.2 to snapshot and re-validate proposals
- [ ] #5 Agentic and user content is never hard-deleted (soft-delete with restore); when an anchor cannot resolve, the content is preserved for re-attachment and never auto-pruned (the repair UX itself is task-27.1)
- [ ] #6 The model reserves the open shapes that keep the two directions additive — a per-table preserved/disposable tag, open-valued provenance fields, and an open ordered layer list in `render()` — so task-27.1 and task-27.2 add no schema migration

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

### A. Three tiers over one store

- Realized on `task-21.1` (`GraphStore` interface, node id = `(file_path, anchor?)`, non-optional edge provenance, content-hash invalidation primitives). Nothing here binds to SQLite directly.
- **Raw tier (L0, disposable):** Ariadne code edges + literal doc/frontmatter edges, each with provenance (`source_file`, `source_range`, `extractor_id`, `confidence`). Free and deterministic to recompute, so it is nuked and rebuilt from scratch when code changes — it holds no irreplaceable state.
- **Agentic tier (L1, preserved):** the higher-level and aggregating nodes that group the raw graph into a connected picture, plus agent-authored behaviour descriptions, groupings, and inferred edges. This is what turns a raw call graph into something comprehensible. It is preserved across a re-parse because regenerating it costs LLM time and is non-deterministic; it is rebuilt only on an explicit, run-when-asked agentic pass (task-27.1), never silently on code change.
- **User tier (L2, preserved):** labels, pins, positions, manual descriptions, and inferred-edge accept/reject adjudications — irreplaceable, and the thing that must never be lost.
- `diagram = render(layers)` composes the tiers. The layer list is **open and ordered**, so a later "proposed" overlay (task-27.2) is one more layer, not a signature change.

### B. Preservation — agentic and user content are never lost

- **Field-granularity watermarking on a precedence ladder `user (2) > agentic (1) > raw (0)`:** each field records its owning tier; a write at tier T overwrites a field only if its current owner ranks ≤ T. So a raw re-parse writes only raw-owned fields, an explicit agentic pass writes raw- and agentic-owned fields but never user-owned, and a user edit overrides anything. (Some fields are dual-sourced — e.g. a node `description` has an agentic generated default that a user edit promotes to user-owned, after which neither a re-parse nor a later agentic pass overwrites it.)
- **Soft-delete with restore:** every user-visible destructive op sets a `deleted_at` flag; there is no hard DELETE on agentic or user content.
- **Rebuild policy:** a schema-version mismatch nukes and rebuilds only the disposable raw tier; the agentic and user tiers and git-tracked JSON sidecars are the recovery source. Whether a table/field is disposable or preserved is an **explicit per-table property** the rebuild routine consults — not a hard-coded name list — so new preserved tables (e.g. task-27.2's pending-edit queue) declare themselves without reworking the rebuild logic.

### C. Anchoring — agentic and user content survive code edits

- Agentic and user content references code elements by **anchor** = symbol path + content hash, never a line number or a bare name — so a description follows a renamed function without re-typing.
- A single reusable **resolver** maps an anchor to its current code state, returning the `{symbol_path, content_hash, span_hash}` tuple. This resolver is the one place both directions genuinely share: task-27.1 calls it to detect drift and re-attach preserved content; task-27.2 calls it to snapshot a proposal's base state at propose time and to re-validate at apply time.
- The resolver reports a clean hit, a downgrade (the element moved/renamed but is still resolvable), or a miss. What to _do_ with a downgrade or miss — surface it for review, hold it in a re-attachment bin — is task-27.1's repair policy; the model only guarantees the content is preserved until then.

### D. Open shapes reserved for both directions

The store's no-migration policy (nuke-and-rebuild only, never `ALTER`) means the shapes the two directions will need must be reserved here, not widened later:

- Preserved-tier (agentic and user) rows carry an open-valued `origin` (which producer wrote the row) and `intent_source` (whose intent it reflects — `code-edit | diagram-edit | explicit-pin`). task-27.1 only ever writes `code-edit`/`code-change`; task-27.2 fills the rest. Unused values are reserved, not added by a later constraint change.
- The render layer list is open and ordered (see A).
- The resolver returns the full state tuple (see C) even when a given caller uses only part of it.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
