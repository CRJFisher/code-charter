---
id: TASK-21.1
title: Persistent graph store with provenance and content-hash invalidation
status: To Do
assignee: []
created_date: "2026-05-25"
labels:
  - architecture
  - storage
  - caching
  - graph-db
dependencies:
  - task-21
parent_task_id: TASK-21
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The foundation that every later piece of task-21 sits on: a small persistent graph store that holds typed nodes, typed edges, edge-level provenance, and per-file content hashes — with the primitives needed to invalidate edges precisely when a source file changes.

The emphasis is on **minimal**. This is not a fully-incremental caching layer; it is the schema and the primitives a future caching layer can be built on. The actual hash-and-skip loop can wait until v1 extraction is slow enough to need it. What cannot wait is getting the provenance and identity model right — those decisions are load-bearing and expensive to change later.

A short list of decisions this task must lock in early, because every later sub-task depends on them:

- **Node identity is `(file_path, anchor?)`**, never skill names or other domain-specific identifiers. The store has no concept of "skill" — that's a v1 _consumer_ of the store, not a concept _inside_ it.
- **Edge types are namespaced open strings** (e.g. `skill.to_script`, `code.calls`, `doc.path_literal`), not a closed enum. The store treats them opaquely.
- **Every edge carries `source_file`, `source_range`, `extractor_id`, `extractor_version`, `confidence`**. Provenance is what makes any future invalidation precise.
- **Cache keys (when caching is wired in later) are `(content_hash, extractor_id, extractor_version)`** — never scoped by skill or other domain concept.

SQLite (via `better-sqlite3`) is the chosen engine: matches the v2/v3 endpoint from the parent task, avoids migration debt, and is already a likely dep in this extension host. The schema is the deliverable; the engine is swappable behind a `GraphStore` interface so nothing downstream binds directly to SQLite.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `GraphStore` interface defines insert/update/delete/query operations for nodes, edges, and file-content hashes; nothing downstream imports SQLite directly
- [ ] #2 SQLite implementation of `GraphStore` with a small schema covering: nodes (id, kind, path, anchor, attributes), edges (src_id, dst_id, kind, confidence, attributes), edge_provenance (edge_id, source_file, source_range, extractor_id, extractor_version), file_hashes (path, sha256, size, last_seen_at), and a schema_version sentinel
- [ ] #3 Node IDs are derived from `(file_path, anchor?)` — the store rejects node inserts that omit a stable path-based id; no domain-specific id schemes are used
- [ ] #4 Edge `kind` is a free string with a recommended namespace convention documented in a top-of-file comment; the store does not enforce a closed enum
- [ ] #5 Every edge insert requires `extractor_id`, `extractor_version`, `source_file`, `source_range`, and `confidence` — provenance is non-optional
- [ ] #6 `compute_file_hash(path)` returns a sha256 over file content; `record_file_hash(path)` writes it to the store; `file_changed_since_recorded(path)` returns true iff the on-disk content hash differs from the stored one (using `(size, mtime)` as a cheap pre-filter is acceptable but sha256 is authoritative)
- [ ] #7 `invalidate_edges_for_files(paths[])` deletes (or marks stale) every edge whose `source_file` is in `paths` — used as the v1 invalidation primitive on file change
- [ ] #8 The store survives a process restart with all data intact; the on-disk file lives at `.code-charter/graph.db` and is gitignored by default
- [ ] #9 A `schema_version` sentinel exists; mismatches are handled by nuking and rebuilding, not by migration (per project policy on backwards compatibility)
- [ ] #10 Unit tests cover: insert nodes/edges, query by neighborhood, change a file, observe `invalidate_edges_for_files` deletes only the affected edges; the test target completes in <500 ms total

<!-- AC:END -->

## Out of scope

- The hash-and-skip extractor loop itself (that's the consumer's responsibility, and v1 may not need it at all given typical skill-ecosystem size)
- LLM-inferred edges and their separate cache layer (deferred until v1 has any LLM extractor; the schema accommodates them via the `confidence` and `extractor_id` columns)
- Per-symbol or per-section content hashing (file-granularity is the v1 unit; symbol-level can be added later as a column on `file_hashes` without breaking the schema)
- Reverse-incidence invalidation (when a renamed symbol invalidates docs that mentioned it) — defer; full re-extraction handles it at v1 scale
- Any specific extractor (literal, AST, LLM) — those land in their consuming sub-tasks
- Any UI integration — this is pure infrastructure
- MCP server exposure — deferred to a later sub-task

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

<!-- Added when work begins. -->

<!-- SECTION:PLAN:END -->
