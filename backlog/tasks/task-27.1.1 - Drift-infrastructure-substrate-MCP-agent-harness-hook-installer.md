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

This is the root dependency of the milestone slice (task-27.1.2), the flow-detection agent (task-27.1.5), and the auto-sync engine (task-27.1.6): the milestone needs `drift.resolve` + a `SessionStart` hook; flow detection and drift reconciliation need a uniform way to launch a model with a bounded budget as a detached background sub-agent.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `drift` **MCP server** exposes the small user-facing surface — at minimum `drift.resolve(id, resolution)` (write: reattach/delete from the re-attachment bin) and `drift.list(scope?)` (read) — registered and agent-callable; each call is logged with timestamp + caller. (No audit table is reserved in task-27.0; this is plain call logging, not a reserved audit path.) The agentic diagram writers do **not** go through MCP — they write the in-process store directly (AC#2). Transport, tool schemas, and the server's location relative to the VSCode extension are pinned
- [ ] #2 The harness exposes **two distinct primitives** (v1 builds exactly one path each, behind a thin interface — no enumerated swappable backends): **`invoke_agent`** — a bounded synchronous model call (Sonnet tier, batching unit, hard cost/time ceiling) that **returns a result** (used by description batches and, post-v1, triage); and **`spawn_background`** — a detached background sub-agent that does its work, **writes the in-process store directly** under `rebuild_layer('agentic')`, and **returns nothing** (used by flow detection task-27.1.5 and drift reconciliation task-27.1.6). "No context rot" is a property of the main-session boundary: the detached sub-agent never returns into the main session
- [ ] #3 A **hook installer** registers the `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop` entries; it is idempotent. A file-change/`Stop` hook that detects a stale flow **launches the reconciliation sub-agent as a detached background process** (per AC#2 `spawn_background`) without interrupting the user. It abstracts its **install target** (path + envelope) behind a host-keyed layout rather than hardcoding `.claude/settings.json`; v1 ships only the Claude-Code target, but adding a Cursor / `.agents` / `.codex` target is an added layout entry, not a caller refactor (keeps the portability-scope decision open — see task-27.1.8). (D-SUBAGENT-TRIGGER is resolved: the hook launches a detached process; the main agent is not asked to spawn.)
- [ ] #4 A documented **host × surface degradation matrix**: where a host lacks a primitive (e.g. Cursor has no `SessionStart`), the live banner degrades to the `/drift` slash command or an MCP pull of outstanding drift; the MCP server is the universal fallback for the write tools. The matrix reserves known future rows (the neutral `.agents/skills/` path; OpenCode's hooks-via-JS-plugin gap) without building them now
- [ ] #5 The substrate degrades gracefully on a host without the store (task-27.0.1's `NullGraphStore`) — the MCP tools return empty/no-op rather than throwing

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **MCP server:** a new entry (package or vscode extension surface) exposing `drift.resolve`/`drift.list`; pin the `@modelcontextprotocol/sdk` version, transport (stdio vs SSE), and tool schemas; wrap every call in an audit log row.
2. **Agent-invocation harness:** two entry points — `invoke_agent(request, {model, ceiling, batch})` (synchronous, returns a result; used by the description batches in task-27.1.4 and the key-control-flow agent in task-27.1.7) and `spawn_background(request)` (detached, writes the store directly, returns nothing; used by flow detection in task-27.1.5 and drift reconciliation in task-27.1.6).
3. **Hook installer:** write the hook entries + git pre-commit hook on first activation (or a `/code-charter setup` command); detect absent primitives and record the degraded surface.
4. **Degradation matrix:** a small table mapping {host} × {SessionStart, UserPromptSubmit, PreCommit, PostToolUse/Stop} to the live or fallback surface.
5. Tests: MCP tools registered + audited; installer idempotency; harness ceiling enforced; NullGraphStore no-op path.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- Added when work begins. -->
