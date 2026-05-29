---
id: doc-4
title: Useful Diagrams For Software Development
type: other
created_date: "2026-05-27 00:00"
---

# Useful Diagrams For Software Development

Running catalog of diagram kinds that earn their keep in real software work, plus the layout principles that make them readable. Add a new entry whenever a diagram shape proves itself; prune when it doesn't.

## How to use this doc

- One subsection per **diagram kind**. Keep each to: _What · When · Nodes · Edges · Interaction · Notes_.
- Cross-cutting layout/presentation rules live under [Presentation principles](#presentation-principles).
- Open questions go at the bottom — promote to a kind once they earn it.

---

## Diagram kinds

### Data-store flow (pipeline view)

- **What**: nodes = data stores; edges = read/write by a simplified set of processors. Hides processing nuance.
- **When**: data pipelines, ETL, event-driven systems — anywhere "where does the data live + who touches it" beats "what happens to it".
- **Nodes**:
  - stores (DB tables, topics, blobs, caches, files)
  - processors shown only as thin interfaces (their reads/writes), not their internals
- **Edges**: directed, labelled `read` / `write` / `read+write`.
- **Interaction**:
  - click store → show schema
  - schema sourced from codebase if present (link to file:line)
  - else auto-generate schema artifact (candidate output of [task-21](../tasks/task-21%20-%20Doc-code-linkage-as-portable-MCP-server-and-skill-bundle.md))
- **Notes**:
  - duplicate a store node when read at one end and written at the other — flow linearity > node uniqueness (see [Presentation principles](#presentation-principles))
  - processor internals belong in a separate per-component diagram, linked from the processor node

### _(more kinds — TBD)_

Candidates to flesh out:

- Control-flow / business-logic flowchart (Code Charter target — see [doc-1](doc-1%20-%20Flowchart-Evolution-Phasing-Strategy.md))
- Call graph (current Code Charter view)
- Module/dependency graph
- Sequence diagram for cross-service request flows
- Skill/agent chain diagram (see user-level `skill-diagrammer` skill)
- State machine / lifecycle
- Deployment / infra topology

---

## Presentation principles

Cross-cutting; apply to every kind above unless noted.

### Layout

- **Maximise linearity** of the primary flow — reader's eye should travel one direction (LR or TD) without zig-zag.
- **Minimise edge crossings**. Crossings cost more comprehension than duplicated nodes.
- **Duplicate nodes** when it removes a long back-edge or crossing — e.g. a store read at the start _and_ end of a flow appears twice. Mark duplicates visually (same shape/colour, same label).
- **No cross-phase back-edges**. Demote to a separate "maintenance" diagram or a stub annotation. (lifted from `skill-diagrammer`)
- **Phase bands / subgraphs** to group nodes by lifecycle stage; keep read-only inputs on a side rail.

### Node grammar

- One shape per role, kept consistent across the doc. Suggested baseline:
  - cylinder = store
  - rectangle = processor / step
  - parallelogram = artifact / payload
  - rhombus = branch
  - subroutine = sub-agent / external service
- Reserve **colour** for _kind_, not emphasis. Reserve **weight/dash** for emphasis (loop-closure, hot path).

### Edge grammar

- Default edges quiet (thin, grey). Reserve bold/red/dashed for ≤2 edges that carry the diagram's headline insight.
- Label edges only when the label adds info the shapes don't (`read`, `write`, condition, payload type).

### Information density

- Hard cap: **~10 nodes** for whole-system view, **~30** for per-component view. Beyond that, aggregate and link to a deeper diagram.
- Every node must map to something on disk (file, store, service). If you can't point to it, delete it.
- Every diagram needs a one-paragraph caption: what flow, what's hidden, where to find the detail.

### Interaction (for tooling, not static images)

- Click node → jump to source / schema / docs.
- Hover edge → reveal payload sample or query.
- Toggle layers (e.g. show/hide processors, show/hide error paths) instead of cramming everything onto one canvas.

---

## Open questions

- How to keep diagrams in sync with code automatically? (overlap with [task-21](../tasks/task-21%20-%20Doc-code-linkage-as-portable-MCP-server-and-skill-bundle.md))
- Standard format for "schema" artifact when no schema file exists in the repo?
- When does a kind deserve its own renderer vs. just a Mermaid convention?
- Cross-diagram navigation — how does a reader move from store-flow → processor internals → call graph without losing context?
