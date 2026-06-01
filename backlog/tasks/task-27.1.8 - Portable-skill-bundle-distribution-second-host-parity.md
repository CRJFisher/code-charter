---
id: TASK-27.1.8
title: "Portable skill-bundle distribution: second-host parity without translation code"
status: To Do
assignee: []
created_date: "2026-06-01"
labels:
  - mcp
  - skills
  - hooks
  - portability
parent_task_id: TASK-27.1
dependencies:
  - task-27.1
  - task-27.1.1
  - task-27.1.5
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **High-level / compatibility-seam sub-task** (folded from task-21's portability residue).

The 27.0/27.1 line already realizes most of task-21 (persisted graph, MCP surface, hooks, agentic inference, doc nodes). The residue is **cross-tool portability as a distribution deliverable**: the same artifact set (the MCP server + the custom sub-agent definitions + hooks) producing a usable experience in a host beyond Claude Code **without per-tool translation code**. The host-neutral install-target abstraction is reserved in task-27.1.1.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 code-charter's own capability (MCP server + custom sub-agent defs + hooks) is a single host-neutral bundle whose install target is selected by a host-keyed layout, no caller hardcoding `.claude/`
- [ ] #2 The same artifact set produces a usable experience in at least one host beyond Claude Code (Cursor lowest-friction) without per-tool translation code — **subject to D-PORT-SCOPE / D-PORT-HOSTS**
- [ ] #3 The MCP server is the universal fallback; the neutral `.agents/skills/` path and OpenCode's hooks-via-JS-plugin gap are handled or explicitly deferred per the host matrix (task-27.1.1)
- [ ] #4 No regression to the Claude-Code-native experience; versioned/droppable bundle only if **D-BUNDLE-ARTIFACT** selects that framing

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-PORT-SCOPE** — v1 deliverable vs compatibility-seam-only vs deferred shell.
- **D-PORT-HOSTS** — Claude Code only · + Cursor · + OpenCode · all five via MCP fallback.
- **D-BUNDLE-ARTIFACT** — versioned droppable bundle vs installer-output-suffices vs defer.
- **D-SKILL-ENTRY-SURFACE** — does rendering a skill directory get its own entry surface, or is it the flow selector scoped to a skill dir? (A skill dir is one flow.)

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
