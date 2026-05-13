---
id: TASK-21
title: Doc–code dependency graph and consistency engine
status: To Do
assignee: []
created_date: "2026-05-12"
labels:
  - architecture
  - ariadne
  - docs
  - graph-db
  - consistency
  - claude-code
  - ui
dependencies: []
references:
  - backlog/tasks/task-14 - Rethink-code-charter-docstring-driven-summaries-with-Claude-Code-hooks-and-skills.md
  - backlog/tasks/task-20 - Evolve-call-graph-visualization-into-business-logic-flowcharts.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Promote code-charter from a code-only call-graph visualizer into a unified **doc–code dependency graph**: ingest Ariadne's analysis of source code _and_ the surrounding documents (Markdown READMEs, API docs, ADRs, skill files, design notes), extract cross-modal links between them, persist the graph in an embedded database, and drive two output channels: (a) whole-codebase visualization that includes documents alongside code, and (b) a consistency engine that, when a node on either side of a link changes, prompts the editing agent to verify the linked artifact is updated in tandem and that the graph itself is updated.

## Problem Statement

A codebase is a bimodal artifact. Source code carries machine-checkable structure; documents carry the intent, contracts, and operational knowledge that the source code alone cannot express. Today these two halves drift independently:

- A README describes an entry point that has since been renamed; no signal fires.
- A SKILL.md prose mentions `scripts/foo.ts` that was deleted; no signal fires.
- An API doc describes a function whose signature has changed; no signal fires.
- A design doc references "the resolver" — an alias for a function — but no machine-readable link exists between the term and the symbol.

Ariadne captures code↔code edges with high fidelity. **Doc↔code and doc↔doc edges are entirely missing.** Without them:

1. The author of a codebase cannot see "everything that depends on this function" or "every place this concept is described" — only the code half.
2. Editing tools (notably Claude Code) cannot warn the author when a code edit invalidates a documented contract, because no representation of that contract exists in machine-readable form.

This task introduces that missing layer. It is the natural extension of code-charter's intention tree (turning complex code into diagrams that distill key patterns) to the part of the codebase that currently slips through: prose.

## Why a Database

Code-charter today computes graphs per-run from Ariadne output and clustering. A persistent store becomes necessary once documents enter the model because:

- **Diff detection** — the consistency engine needs to compare the current graph to the previous graph to identify which edges were broken/added by a change. That requires durable state across runs.
- **Incremental update** — re-analyzing the whole codebase on every doc save is wasteful. Per-file ingestion writing into a shared store is the right shape.
- **Query layer** — the consistency engine and the visualizer both ask "what depends on X?" / "what describes X?" at interactive latency. That is a database concern.
- **Provenance** — each cross-modal edge has a source (a line in a Markdown file, an identifier in prose, a path literal) that must be retrievable for the consistency engine to surface "this link in `README.md:42` is now stale."

SQLite (better-sqlite3) is the default pick: embedded, zero-ops, queryable, and aligned with code-charter's local-first stance. The schema is the deliverable, not the engine choice.

## Fit With Existing Roadmap

- **Extends task-14**: task-14 wires code-charter into Claude Code via hooks/skills for cluster summary maintenance. The consistency engine is the same shape — a hook fires on edit, a skill verifies/updates linked artifacts — generalized from "clusters" to "any doc–code link."
- **Generalizes task-20**: task-20 evolves call-graph rendering into business-logic flowcharts. Doc nodes carry the _semantic_ layer that flowcharts surface heuristically; once doc–code links exist, flowchart labels can be grounded in the prose that defined them.
- **Subsumes the original skill-mode framing**: a Claude Code skill (`SKILL.md` + `scripts/`) is the smallest example of the doc–code linkage problem. It is the right validation use case, not the whole task.

## Graph Model

**Nodes**:

- _Code nodes_ — produced by Ariadne: function, class/interface, method, module/file. Identified by Ariadne's symbol ID.
- _Doc nodes_ — produced by a Markdown ingestor: document, section (by heading path), code fence, callout/admonition. Identified by `(file_path, anchor)`.

**Edges**:

- _Code → Code_ — from Ariadne (calls, references, inherits).
- _Doc → Code_ — prose identifier mentions, path literals, hyperlinks to symbol pages, embedded code fences naming real symbols, frontmatter fields referencing scripts/tools (e.g. `allowed-tools: Bash(node ... scripts/foo.ts)`).
- _Code → Doc_ — comments and docstring bodies that cite documents (`@see README.md#section`, "see ADR-007").
- _Doc → Doc_ — Markdown links between files, `references:` frontmatter fields.

Every edge carries provenance: `source_file`, `source_range`, `extractor` (which rule produced it), `confidence` (literal match = high; LLM inference = lower).

## Use Cases

### (a) Unified visualization

The existing code-charter UI gains a "show docs" toggle. Documents render as a visually distinct node type adjacent to the code they describe. Selecting a code node reveals every doc that mentions it; selecting a doc node reveals every symbol it references. The ecosystem view from the earlier skill framing becomes one tier of this: a single skill, an entire `.claude/skills/` tree, an entire repository — all the same graph at different scopes.

### (b) Consistency engine

When a code symbol or a doc node is modified, the engine identifies every cross-modal edge incident on that node and surfaces those edges as **review obligations**. Triggered via Claude Code hooks (`PostToolUse` / `Stop`), the engine:

1. **Verifies linked artifacts** — for each affected edge, spawn an agent (or skill) that reads the doc + code pair and decides whether the doc still describes the code accurately. Reports stale links to the editing session.
2. **Updates the graph** — re-runs the cross-modal extractor on the changed files and writes updated edges to the database. If the change adds new mentions/links, those edges appear; if it removes them, edges are deleted.

Both phases produce output that is surfaced to the human-in-the-loop developer through the existing Claude Code session — _not_ applied silently. The engine is an assistant, not an enforcer.

## Approach Outline

Implementation phases (each will become its own atomic sub-task; this task is the umbrella):

1. **Schema + persistence** — SQLite schema for nodes, edges, content hashes, edge provenance. Migrations strategy. `GraphStore` interface so the rest of code-charter doesn't bind to SQLite directly.
2. **Code ingestion** — adapter that pipes Ariadne's output into `GraphStore`. Reuse existing `@ariadnejs/core` integration.
3. **Doc ingestion** — Markdown parser (likely `remark` + `mdast-util-*`) producing doc nodes per file/section/fence. Stable IDs keyed on `(path, heading-anchor)`.
4. **Cross-modal extractors** — start with literal extractors (identifier mentions matching symbol names, path literals matching real files, frontmatter fields with known semantics). Add LLM-assisted inference as a separate higher-confidence pass for cases where literal matching is insufficient (e.g. "the resolver" referring to a function whose actual name is `resolve_call`).
5. **Linker skill / custom agents** — Claude Code skill plus dedicated sub-agents that propose new cross-modal edges from prose and ask the user to confirm, then write them to the store. This handles the LLM-inference cases that need human-in-the-loop validation.
6. **Visualization integration** — extend the existing React Flow UI with doc node types, the show-docs toggle, and the doc↔code edge styling. Lean on task-20's shaped-node infrastructure.
7. **Consistency engine** — Claude Code `PostToolUse` / `Stop` hook + companion skill. Hook computes edge incidence on changed files; skill dispatches verifier agents per affected edge and reports stale links. Engine also re-runs the extractors to update the graph.
8. **Skill-mode validation** — the original task-21 framing as the first end-to-end demo. Visualize `ariadne/.claude/skills/triage-curator/`: SKILL.md doc nodes, scripts code nodes, sub-agent dispatch edges, cross-skill data edges. If this case works, the general approach is validated.

## Out of Scope

- **No live pipeline/state monitoring.** Run history of skill executions is unrelated to this task; the graph is structural, not temporal.
- **No metadata injected into SKILL.md or any other source file.** All links are inferred from existing content and stored externally in the database. Source files are not modified.
- **No custom syntax** for declaring doc–code links inline. Extractors operate on natural prose + existing Markdown conventions.
- **No multi-user / remote graph store** in v1. SQLite, local, single-developer. Distribution comes later if at all.
- **No silent auto-edits** by the consistency engine. Surface obligations; leave acceptance to the developer / Claude Code session.

## Validation Bar

1. Skill-mode renders `ariadne/.claude/skills/triage-curator/` such that the author can identify QA + investigate sub-agent waves, the upstream `self-repair-pipeline` data input, and the downstream backlog/registry outputs without consulting source.
2. Editing a function name in code-charter itself and saving causes the consistency engine to surface every README/ADR/skill section that mentioned the old name.
3. Adding a new `@see scripts/foo.ts` comment to a code file results in a new doc→code edge appearing in the graph without manual intervention.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Code-charter has an embedded graph database (SQLite) with a schema covering code nodes, doc nodes, and typed edges between them, accessed through a `GraphStore` interface
- [ ] #2 Code ingestion writes Ariadne's call-graph output into the database; doc ingestion writes Markdown files (including SKILL.md, README, ADRs) into the database as doc nodes keyed by `(path, heading-anchor)`
- [ ] #3 Cross-modal extractors produce doc→code and code→doc edges from literal identifier mentions, path literals, hyperlinks, frontmatter fields, and docstring `@see` directives — each edge stores its source range and extractor name as provenance
- [ ] #4 An LLM-driven linker skill / custom agent can propose additional doc→code edges from prose that does not contain literal symbol names, and these proposals are confirmed by the user before being written to the store
- [ ] #5 The existing code-charter UI renders documents as visually distinct nodes alongside code nodes; selecting any node reveals all incident cross-modal edges
- [ ] #6 A Claude Code hook + companion skill comprise a consistency engine: on file edit, it identifies cross-modal edges incident on the changed file, dispatches per-edge verifier agents, and surfaces stale links to the editing session
- [ ] #7 After surfacing stale links, the consistency engine re-runs the extractors and updates the graph database to reflect added/removed edges
- [ ] #8 Skill-mode is implemented as the first end-to-end validation: running code-charter against `~/.claude/skills/<name>/` produces a diagram combining SKILL.md doc nodes, script code nodes, sub-agent dispatch edges, and cross-skill data edges — without modifying any skill file
- [ ] #9 Editing a code symbol in code-charter itself triggers the consistency engine to surface every Markdown section that referenced the old identifier
- [ ] #10 The consistency engine never silently edits source files; all surfaced obligations require developer acceptance via the Claude Code session
<!-- AC:END -->
