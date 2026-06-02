---
id: TASK-21.2
title: Skill diagram v1 for Claude Code skills
status: To Do
assignee: []
created_date: "2026-05-25"
labels:
  - architecture
  - ariadne
  - docs
  - skills
  - ui
  - extraction
dependencies:
  - task-21
  - task-21.1
parent_task_id: TASK-21
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

First end-to-end deliverable for the doc-code linkage roadmap: render any Claude Code skill (a directory under `~/.claude/skills/<name>/` or `.claude/skills/<name>/`) as a diagram in code-charter that shows the relationships between SKILL.md, the scripts it invokes, and the reference documents it links.

Skills are the right v1 target because they combine markdown and scripts in a constrained shape that real users (including this project's author) edit regularly. Surveying real skills on disk shows the data is largely structural — markdown links, frontmatter, well-known directory layout — so literal extractors carry v1 almost on their own. No LLM-inferred edges in v1.

The deeper purpose is validating the design: if a skill diagram renders correctly for `apply-practices`, `drive-folder-sync`, and `skill-diagrammer`, the graph store, the extractor pattern, the provenance model, and the UI integration are all proven for the harder cases that follow.

### What the v1 diagram shows

For a single skill: SKILL.md at the centre, scripts as code-style nodes, reference docs as doc-style nodes, edges following the literal markdown-link mentions and (when present) the user's already-published `meta.json sub_agents[]` declarations.

Across multiple skills (the ecosystem view): the same graph with cross-skill edges where one skill's SKILL.md mentions another by bare name, slash-command, or `../<other-skill>/...` relative path. Reuse of the existing code-charter zoom/cluster machinery to drill-down between scopes.

### What is deliberately left open

- The exact extractor regexes and parsers — guided by the survey of real skills, refined during implementation against real targets
- The exact wire-up between extractor outputs and `GraphStore` writes
- The choice of which existing code-charter UI pieces to extend versus add anew
- How sub-agent dispatches surface visually when they appear (rare in current corpus; user's `meta.json sub_agents[]` schema is the gold path when populated)
- Whether to ship an MCP server in this sub-task or defer (recommend defer; the UI alone proves the graph is real)

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Code-charter can ingest a single skill directory (`<root>/SKILL.md` + any of `scripts/`, `references/`, `agents/`, `assets/`, plus root-level helper files like `analyze-sessions.mjs`) into the persistent graph store from task-21.1
- [ ] #2 Literal extractors produce edges for: markdown links from SKILL.md to bundled files (scripts and references), backticked path mentions in SKILL.md prose that resolve to real bundled files, and (when present) `meta.json sub_agents[]` declarations
- [ ] #3 Code structure within scripts is extracted via Ariadne for languages it already supports (TypeScript, JavaScript, Python, Rust); unsupported languages (Bash, others) become opaque file nodes with a literal-reference scan over their bodies
- [ ] #4 Frontmatter is parsed tolerantly (handles `tools` vs `allowed-tools` variants, `user-invocable` vs `user_invocable`, multi-line block scalars, both inline-list and YAML-list forms); frontmatter is surfaced as node attributes, not as separate nodes
- [ ] #5 Edge extractors do not produce false-positive edges from: bash fenced code blocks discussing usage, mermaid fences, prose-style mentions of file/concept names that are not literal link targets, or behavioral descriptions
- [ ] #6 The existing React Flow + ELK UI renders the skill diagram with distinct visual treatments for SKILL.md, scripts, and reference docs; edge styling distinguishes literal-link edges from any other categories the implementation introduces
- [ ] #7 Selecting a skill-doc node reveals frontmatter contents and the prose spans that drove outgoing edges (provenance click-through using the `source_range` stored in task-21.1)
- [ ] #8 The system handles the three on-disk validation targets correctly, producing diagrams the user immediately recognises as those skills:
  - `apply-practices` (no scripts, no bundled refs) renders as a single annotated node
  - `drive-folder-sync` (one script) renders SKILL.md → `scripts/sync_template.py` with the two literal markdown-link occurrences deduplicated
  - `skill-diagrammer` (one script, six reference docs, reciprocal cross-refs between refs) renders the full fan-out plus the script node
- [ ] #9 Extraction + render for a single skill completes in under 2 seconds on a warm cache; under 5 seconds on a cold cache. Failing this is a signal to wire in the file-hash invalidation primitives from task-21.1, not a signal to redesign
- [ ] #10 Ecosystem view: ingesting all skills under `~/.claude/skills/` produces a single graph where cross-skill mentions render as edges between distinct skill diagrams. The UI defaults to single-skill focus with a path to expand into the ecosystem view (e.g. via the existing zoom/cluster mechanism)

<!-- AC:END -->

## Out of scope

- LLM-inferred edges (literal extractors only; behavioural and alias mentions are a v2 problem)
- The consistency engine and Claude Code hooks for file-save invalidation (a later sub-task)
- An MCP server surface (deferred; the UI is the v1 consumer)
- Cursor / OpenCode / Codex / Gemini CLI parity (a later sub-task; v1 is Claude Code targeted)
- Sub-agent definition files inside code-charter itself (the parent task lists this as AC #6; defer)
- General Markdown ingestion of READMEs, ADRs, design notes outside the skill directory shape (the v2 broadening)
- Any LLM-driven calibration or human-in-the-loop edge confirmation workflow

## Validation targets (concrete)

Three real skills already on disk, at three complexity tiers:

1. **Trivial — `apply-practices`**: one `SKILL.md`, no bundled scripts or references. The diagram is a single annotated node. External path mentions in prose (e.g. `~/.claude/rules/`, `~/.claude/scripts/dispatch.cjs`) must NOT become edges — they are outside the skill bundle.

2. **Medium — `drive-folder-sync`**: `SKILL.md` plus `scripts/sync_template.py`. Two literal markdown-link occurrences of the script — extracted as one deduplicated edge with two provenance entries. Frontmatter `allowed-tools: Bash, Read, Write, Edit, AskUserQuestion` surfaces as a metadata panel, not edges.

3. **Rich — `skill-diagrammer`**: `SKILL.md` plus six reference docs at the skill root (`anatomy.md`, `meta-json.md`, `methodology.md`, `palette.md`, `topology-reporter.md`, `triggers.md`) plus `scripts/describe_mermaid_topology.ts`. Multiplicity (anatomy referenced 5×) collapses to one edge. Reciprocal cross-refs between the reference docs also render. The script node is visually distinct from the markdown reference nodes.

## Design rules to preserve v1→v2 portability

The parent task identifies several decisions that must not bake in skill-specific assumptions. Restated for this sub-task:

- Node IDs are `(file_path, anchor?)` — never skill names
- Edge `kind` values are namespaced strings (`skill.to_script`, `skill.to_reference`, `code.calls`) — not a closed enum
- Extractors take generic config (file globs, regex, frontmatter field names) — they do not hardcode the skill directory layout; they accept it as input
- The MCP tool surface (when added in a future sub-task) takes node IDs and filters, never skill identifiers — skill-flavoured helpers can sit on top
- No "doc root" concept in the store; hubs (like SKILL.md) are query-time, not schema-time

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

<!-- Added when work begins. Many architectural choices are still live, including the exact extractor implementations, the precise UI integration points, and whether to ship the ecosystem view in this PR or in a follow-up. -->

<!-- SECTION:PLAN:END -->

## Implementation Notes

### Literal extraction realized by task-27.1.4 (AC#6)

The literal skill-ingestion layer is built and tested in task-27.1.4 as the task-21.2 → task-27.0 extractor port, writing into the shared task-27.0 `GraphStore` (task-21.1's standalone store never shipped). `ingest_skill` (`@code-charter/core`, `packages/core/src/extractors/`) reads a skill directory and writes raw-tier rows:

- `code.doc` nodes for SKILL.md, scripts, references, and agent files, with frontmatter surfaced as node attributes (tolerant parser: `tools`/`allowed-tools`, `user_invocable`/`user-invocable`, block scalars, inline vs YAML lists, quoted scalars).
- `skill.to_script` / `skill.to_reference` edges from SKILL.md markdown links, `code.literal-doc` for reciprocal reference cross-refs, and `skill.to_subagent` from `meta.json sub_agents[]` — each with span provenance; repeated links dedupe to one edge with multiple provenance rows; bash/mermaid fenced blocks, inline-code spans, and external/out-of-bundle paths never produce edges (AC#2/#4/#5 satisfied at the extraction layer).

**Remaining for this task:** the React Flow + ELK render surface with distinct node/edge treatments and provenance click-through (AC#6/#7), the ecosystem cross-skill view (AC#10), Ariadne code-structure extraction inside scripts (AC#3), backtick-path prose scanning, and the 2s/5s warm/cold perf targets (AC#9). The extraction primitives and the persistent store those build on are in place.
