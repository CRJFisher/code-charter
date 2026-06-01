---
id: TASK-27.1.1
title: "Drift infrastructure substrate: MCP server, agent-invocation harness, hook installer"
status: To Do
assignee: []
created_date: "2026-05-31"
labels:
  - architecture
  - mcp
  - hooks
  - sub-agents
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.0
  - task-27.0.1
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The net-new infrastructure substrate that the rest of task-27.1 assumes but that exists in **no package today**: the MCP write/read surface, the agent-invocation harness, and the `.claude` hook installer. Scoped strictly to what the drift surfaces, the agentic pass, and the triage sub-agent need — not a general platform (YAGNI).

This is the root dependency of the milestone slice (task-27.1.2) and the consistency engine (task-27.1.5): the milestone needs `drift.resolve` + a `SessionStart` hook; the agentic pass (task-27.1.6) and triage (task-27.1.7) need a uniform way to invoke a model with a bounded budget.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `drift` **MCP server** exposes at minimum `drift.resolve(id, resolution)` (write) and `drift.list(scope?)` (read), registered and agent-callable, over the named-write/audit path task-27.0 reserved; every call is auditable (logged with timestamp + caller). Transport, tool schemas, and the server's location relative to the VSCode extension are pinned
- [ ] #2 A **single named in-process entry point** dispatches an agent/sub-agent invocation; v1 is a bounded synchronous Anthropic SDK call (Sonnet tier) with an explicit batching unit and a hard cost/time ceiling; the mechanism is swappable (SDK call ↔ `claude -p` shell-out ↔ MCP-scoped conversation) without changing callers. It supports **fire-and-forget background sub-agents** that do their work, write the result via MCP tool calls, and **return nothing to the caller** — so a diagram-maintenance sub-agent (flow detection, task-27.1.5; drift reconciliation, task-27.1.6) never pollutes the main session's context (no context rot). Whether the harness auto-spawns or the hook asks the main agent to spawn is **D-SUBAGENT-TRIGGER** (lead: auto-spawn)
- [ ] #3 A **hook installer** registers the `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop` entries plus the git pre-commit hook; it is idempotent and specifies which entry fires the consistency engine vs the drift banner. A file-change/`Stop` hook that detects a stale flow diagram emits a **"spawn sub-agent X as a background task"** instruction (per AC#2) without interrupting the user. It abstracts its **install target** (path + envelope) behind a host-keyed layout rather than hardcoding `.claude/settings.json`; v1 ships only the Claude-Code target, but adding a Cursor / `.agents` / `.codex` target is an added layout entry, not a caller refactor (mirrors task-27.0's open-shape discipline; keeps the portability-scope decision open — see task-27.1.9)
- [ ] #4 A documented **host × surface degradation matrix**: where a host lacks a primitive (e.g. Cursor has no `SessionStart`), the live banner degrades to the `/drift` slash command or an MCP pull of outstanding drift; the MCP server is the universal fallback for the write tools. The matrix reserves known future rows (the neutral `.agents/skills/` path; OpenCode's hooks-via-JS-plugin gap) without building them now
- [ ] #5 The substrate degrades gracefully on a host without the store (task-27.0.1's `NullGraphStore`) — the MCP tools return empty/no-op rather than throwing

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **MCP server:** a new entry (package or vscode extension surface) exposing `drift.resolve`/`drift.list`; pin the `@modelcontextprotocol/sdk` version, transport (stdio vs SSE), and tool schemas; wrap every call in an audit log row.
2. **Agent-invocation harness:** one named `invoke_agent(request, {model, ceiling, batch})` entry point; v1 a synchronous SDK call with a token/time cap; the contract is shaped so task-27.1.6 (batched per-cluster) and task-27.1.7 (per-cluster triage workers) call the same door.
3. **Hook installer:** write the hook entries + git pre-commit hook on first activation (or a `/code-charter setup` command); detect absent primitives and record the degraded surface.
4. **Degradation matrix:** a small table mapping {host} × {SessionStart, UserPromptSubmit, PreCommit, PostToolUse/Stop} to the live or fallback surface.
5. Tests: MCP tools registered + audited; installer idempotency; harness ceiling enforced; NullGraphStore no-op path.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
