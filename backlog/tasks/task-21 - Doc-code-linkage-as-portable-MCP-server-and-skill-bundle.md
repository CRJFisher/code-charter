---
id: TASK-21
title: Doc-code linkage as portable MCP server and skill bundle
status: To Do
assignee: []
created_date: "2026-05-12"
updated_date: "2026-05-25"
labels:
  - architecture
  - ariadne
  - docs
  - graph-db
  - consistency
  - mcp
  - skills
  - sub-agents
  - hooks
  - portability
dependencies: []
references:
  - backlog/decisions/decision-9 - Switch-to-Backlog-md-for-task-management.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Promote code-charter from a code-only call-graph visualizer into a unified **doc-code dependency graph** — extend the existing Ariadne-derived code↔code edges with doc↔code and doc↔doc edges, persist them in an embedded database, and surface the graph through the agentic coding tools developers already use rather than through a bespoke agent built into the VSCode extension.

The hard insight from prior research: code-charter does not need to ship its own agent runtime. Every mainstream agentic coding tool (Claude Code, Cursor, OpenCode, Codex, Gemini CLI) has independently converged on the same four primitives — **MCP server, skills, sub-agents, hooks**. Building the linker as an MCP server + a Claude-shaped skill bundle inherits that runtime for free, eliminates the need for a custom agent loop in the extension, and reaches multiple tools with a single artifact set.

The unknowns this task deliberately leaves open: what tools to expose over MCP, how to structure the skill / sub-agent / hook composition, how to handle the LLM-driven inference cases that literal extractors cannot catch, and (the hardest) how to make incremental update and invalidation correct and cheap. Those decisions belong inside the implementation, not pre-baked here. The goal of this task is to land the surface area; the recipes can evolve.

## Why now

- Doc↔code drift is the single most under-served correctness signal in a modern codebase. Renames, deletions, and contract changes break prose obligations silently.
- The runtime to consume this signal already exists in every developer's editor. The missing piece is the data layer and the protocol surface, not another agent.
- MCP is the closest thing to an open standard for tool exposure across LLM agents. Building on it is the lowest-lock-in bet available today.
- Skills + sub-agents + hooks lifted from `.claude/` are now portable to Cursor (native), OpenCode (skills native, hooks via plugin), and structurally to Codex / Gemini CLI. The window to ship a cross-tool experience is open.

## Surface to build (broad strokes)

The shape, not the spec:

- **A persisted graph** — code and doc nodes, typed edges between them, edge-level provenance. Embedded local store (SQLite is the obvious pick, but the choice belongs in implementation). Schema covers the invariants the consistency engine needs; details are flexible.
- **Code and doc ingestion** — code half reuses the existing `@ariadnejs/core` integration. Doc half ingests Markdown (READMEs, ADRs, SKILL.md, design notes) into the graph with stable IDs.
- **Cross-modal extractors** — literal extractors (identifier mentions, path literals, frontmatter fields, `@see` directives, hyperlinks) populate the high-confidence baseline. They are deterministic, cheap, and the foundation everything else builds on.
- **An MCP server** — exposes a tool surface over the graph and the extractors. The exact tools are a design decision: candidates include graph queries, edge proposal, edge confirmation, candidate discovery, stale-link detection. Keep the surface small enough to be obvious; let the host agent compose them.
- **A skill bundle** — `.claude/skills/` markdown that drives the host agent through the common workflows (initial linkage pass, drift triage, ad-hoc verification). Sharable across Claude Code, Cursor, and OpenCode without translation.
- **Sub-agent definitions** — specialized roles for the linkage workflow (verifier, calibrator, triage). Composition is open: per-cluster workers, per-doc workers, or a single orchestrator are all viable.
- **Hooks** — `PostToolUse` / `Stop` triggers on file edits that invoke the consistency engine. The hook is the entry point; the skill is the recipe; the MCP server is the execution surface.
- **Visualization** — the existing React Flow UI gains a doc-node type and the doc↔code edge styling. Consumes the same graph store as the MCP server.

What is _not_ prescribed here: which MCP tools, how the skill is structured, what topology the sub-agents take, how the LLM-inference layer (for prose-level aliases / behavioral mentions) is shaped, what model is used, what the human-in-the-loop UX looks like inside the host agent. Those are open.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Code-charter persists a doc-code dependency graph in an embedded local store, with code nodes from Ariadne, doc nodes from Markdown ingestion, typed cross-modal edges, and per-edge provenance sufficient to invalidate edges precisely on file changes
- [ ] #2 Literal extractors populate high-confidence cross-modal edges from identifier mentions, path literals, frontmatter fields, hyperlinks, and `@see`-style directives without LLM involvement
- [ ] #3 An MCP server exposes the graph and the linkage workflow as tools that an external host agent can drive, with the tool surface deliberately small and composable
- [ ] #4 A `.claude/skills/` skill bundle drives the host agent through at least the initial-linkage and drift-triage workflows, and works in Claude Code without modification
- [ ] #5 Hooks fire the consistency engine on file edits, identify edges incident on changed files, and surface stale-link obligations to the editing session without silently mutating source
- [ ] #6 Sub-agent definitions exist for the specialized roles the linkage workflow needs (composition left to implementation), and are invokable from the skill bundle
- [ ] #7 The same artifact set produces a usable experience in at least one other host beyond Claude Code (Cursor is the lowest-friction target — reads `.claude/skills/` and `.claude/settings.json` natively), without writing per-tool translation code
- [ ] #8 Incremental update on file change is cheap — re-ingestion and re-extraction touch only affected files, and edge invalidation is driven by content-addressed cache keys rather than wholesale recompute
- [ ] #9 The existing code-charter UI renders doc nodes alongside code nodes and shows incident cross-modal edges on selection
- [ ] #10 An end-to-end demo on at least one real target (code-charter itself, or a Claude Code skill bundle such as `~/.claude/skills/<name>/`) produces a graph that visibly distinguishes code structure from documented structure and detects at least one drift case introduced by a deliberate code edit

<!-- AC:END -->

## Cross-tool compatibility (context, not prescription)

Pre-implementation research (May 2026) verified that the four-primitive architecture (MCP + skills + sub-agents + hooks) maps across the major agentic coding tools. Summary of out-of-box support:

- **Claude Code** — native for all four primitives. The reference target.
- **Cursor** — reads `.claude/settings.json` hooks and `.claude/skills/` natively when the third-party toggle is enabled (as of April 2026). MCP via `.cursor/mcp.json`. Sub-agent support is via the Task tool / Background Agents; no `.claude/agents/` reading. Realistically ~80% of the experience with zero translation code.
- **OpenCode** — reads `.claude/skills/` and `~/.claude/CLAUDE.md` natively. MCP, sub-agents, custom tools all native. Hooks gap: needs a JS plugin instead of shell-command hook arrays (active issue tracks closing this).
- **Codex** — native MCP, skills (`SKILL.md` format identical), TOML sub-agents, hooks with near-identical event names but different JSON envelope. Reads `.codex/` and `.agents/skills/`, not `.claude/`. Sharable via the neutral `.agents/skills/` path.
- **Gemini CLI** — native MCP, sub-agents, hooks. Commands are TOML files, not `SKILL.md` markdown — the largest format gap. No `.claude/` reuse.

Pragmatic distribution stance: ship for **Claude Code + Cursor as the primary targets** (shared `.claude/` tree), let OpenCode pick up skills automatically and write a small plugin for hooks if demand exists, and treat Codex / Gemini CLI as out of scope for v1 unless someone shows up wanting them. The MCP server alone is a universal fallback that works in all five tools without any of the higher-level primitives.

## Ideas to consider (from earlier draft)

### Why persistence is required

- Per-run recomputation breaks down once docs enter the model — diff detection between current and previous graphs is the core operation, and that demands durable state across runs.
- Visualizer and consistency engine both ask "what depends on X?" / "what describes X?" at interactive latency — a query layer, not a recompute layer.
- Default pick: SQLite (better-sqlite3) — embedded, zero-ops, local-first. Schema is the deliverable; engine is swappable behind a `GraphStore` interface so nothing else binds to SQLite directly.

### Provenance model (load-bearing for invalidation)

- Every edge carries: `source_file`, `source_range`, `extractor` (which rule produced it), `confidence` (literal match = high; LLM inference = lower).
- Without `source_range` the engine cannot surface "this link in `README.md:42` is now stale" — provenance is what makes obligations actionable, not just detectable.
- `extractor` field lets you re-run only the responsible extractor when invalidating, and lets literal vs LLM caches age independently.
- Schema must include a content-hashes table alongside nodes/edges so per-file change detection is a hash comparison, not a re-parse.

### Incremental ingestion shape

- Per-file ingestion writing into a shared store is the right primitive — never re-analyze the whole codebase on a doc save.
- Code path: Ariadne adapter pipes per-file output into `GraphStore`.
- Doc path: Markdown parser (remark + mdast-util-\*) produces doc nodes per file/section/fence, with stable IDs keyed on `(path, heading-anchor)` so renames and section moves are detectable rather than indistinguishable from delete+add.

### Diff detection and re-extraction (the consistency engine loop)

- On file edit: hook computes edge incidence on changed files (cheap query against the store).
- Re-run extractors only on changed files; compare new edge set vs stored edge set keyed by `(source_file, source_range, extractor)` to derive added/removed/modified edges.
- Stale-link detection: for each affected edge, dispatch a verifier sub-agent that reads the doc+code pair and reports staleness — does not auto-edit.
- Graph update is a second phase after surfacing: writes added edges, deletes removed ones. Two phases (verify, then update) so the developer sees obligations against the _old_ graph state.

### Edge invalidation triggers

- File edits (any incident edge needs re-verification).
- Symbol renames (every doc node whose literal mention matched the old name).
- Doc deletions (every code→doc `@see` pointing at the deleted anchor).
- Heading-anchor changes (doc→doc and code→doc edges keyed by anchor go stale even if the file persists).

### Literal vs LLM-inferred edge caches

- Literal extractors (identifier mentions, path literals, frontmatter, `@see`) are deterministic — safe to recompute eagerly on any file change; cache keyed by file content hash.
- LLM-inferred edges (e.g. "the resolver" → `resolve_call`) are expensive and require human confirmation — cache aggressively, invalidate only when the _specific_ prose span or the _specific_ target symbol changes, never on unrelated edits to the same file.
- Store the two edge classes with the same schema but distinct `extractor` + `confidence` so a single invalidation pass can treat them differently without branching schemas.

## Out of scope

- No live pipeline / state monitoring. The graph is structural, not temporal.
- No metadata injected into source files. All links live externally in the store.
- No custom syntax for inline doc-code link declarations. Extractors operate on natural prose and existing Markdown conventions.
- No multi-user or remote graph store in v1.
- No silent auto-edits by the consistency engine. Obligations are surfaced; acceptance is the developer's.
- Per-tool translation code for hosts beyond Claude Code + Cursor (+ OpenCode skills) — defer until there is concrete user demand.

## Implementation Plan

<!-- Added when work begins. Left open intentionally; many architectural choices are still live. -->
