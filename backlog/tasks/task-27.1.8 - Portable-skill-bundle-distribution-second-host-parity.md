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
  - task-27.1.6
references:
  - backlog/docs/doc-5 - Diagram-Driven-Development-Functionality.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

> **High-level / compatibility-seam sub-task** (folded from task-21's portability residue).

The 27.0/27.1 line already realizes most of task-21 (persisted graph, hooks, agentic inference, doc nodes). The residue is **cross-tool portability as a distribution deliverable**: the same artifact set — the **`drift-sync` skill** (the single path all agent persistence goes through), the **registered custom sub-agent definitions** (`.claude/agents/*.md`), and a **Stop** hook (blocks + instructs the main agent to launch the sub-agent) — producing a usable experience in a host beyond Claude Code **without per-tool translation code**. (The drift MCP server (`drift.resolve`/`drift.list`) and the read-only SessionStart banner are removed by task-27.1.15, so there is no MCP pull-fallback to carry: the auto-sync write path is the whole product.) Host parity is a question of three capabilities: a **Stop hook that can block and inject an instruction**, **registered custom sub-agents**, and the ability to **run the `drift-sync` skill (or its bundled script directly)**. Where a host lacks the Stop-hook / custom-sub-agent capability, the experience degrades to a host-driven manual `drift-sync` invocation. The host-neutral install-target abstraction is reserved in task-27.1.1.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 code-charter's own capability (`drift-sync` skill + registered custom sub-agent defs + Stop hook) is a single host-neutral bundle whose install target is selected by a host-keyed layout, no caller hardcoding `.claude/`
- [ ] #2 The same artifact set produces a usable experience in at least one host beyond Claude Code (Cursor lowest-friction) without per-tool translation code — **subject to D-PORT-SCOPE / D-PORT-HOSTS**
- [ ] #3 When a host lacks the Stop hook / custom-sub-agent capability, the fallback is a host-driven manual `drift-sync` run (the skill, or its bundled script, invoked directly) — there is no MCP pull-fallback (the drift MCP server is removed in task-27.1.15); the neutral `.agents/skills/` path and OpenCode's hooks-via-JS-plugin gap (which affects the Stop-hook trigger) are handled or explicitly deferred per the host matrix (task-27.1.1)
- [ ] #4 No regression to the Claude-Code-native experience; versioned/droppable bundle only if **D-BUNDLE-ARTIFACT** selects that framing
- [x] #5 The bundle is installed into the target repo at runtime by an explicit actor — the VS Code extension installs/refreshes it into the open workspace, resolving the package root from the bundled extension assets (`require.resolve`), and never installs onto code-charter itself (done for the Claude-Code host in task-27.1.19; the host-keyed layout keeps the actor host-neutral)

<!-- AC:END -->

## Open decisions

<!-- SECTION:DECISIONS:BEGIN -->

- **D-PORT-SCOPE** — v1 deliverable vs compatibility-seam-only vs deferred shell.
- **D-PORT-HOSTS** — Claude Code only · + Cursor · + OpenCode · broader hosts via a manual skill-invocation fallback (no MCP pull-fallback post-strip).
- **D-BUNDLE-ARTIFACT** — RESOLVED (task-27.1.19): installer-output-suffices, no separately versioned droppable bundle. The substrate ships inside the `@code-charter/drift` package (`assets/` + built bins). The installer writes the bundle into an EXTERNAL target repo's `.claude/` with ABSOLUTE bin paths (the bin lives in the installed package, outside that repo); the installed `.claude/` is that user's to commit or ignore. code-charter never keeps a drift surface in its own repo — it is product source and does not run drift on itself.
- **D-SKILL-ENTRY-SURFACE** — does rendering a skill directory get its own entry surface, or is it the flow selector scoped to a skill dir? (A skill dir is one flow.)

<!-- SECTION:DECISIONS:END -->

## Implementation Notes

<!-- Added when work begins. -->
