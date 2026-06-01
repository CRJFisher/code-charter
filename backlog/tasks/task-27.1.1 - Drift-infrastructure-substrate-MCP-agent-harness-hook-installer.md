---
id: TASK-27.1.1
title: "Drift infrastructure substrate: MCP server, reconciliation sub-agent + drift-sync skill, hook installer"
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

The net-new infrastructure substrate that the rest of task-27.1 assumes but that exists in **no package today**: the user-facing `drift` MCP surface, the reconciliation path (a registered Claude Code custom sub-agent plus the `Stop`-hook mechanism that hands it work), the `drift-sync` skill (SKILL.md instructions + a bundled script) that abstracts all store-update internals, and the `.claude` hook + sub-agent + skill installer. Scoped strictly to what the rename milestone, the agentic pass, and lazy diagram hydration need — not a general platform (YAGNI).

This is the root dependency of the milestone slice (task-27.1.2) and the flow hydration / auto-sync engine (task-27.1.6). The milestone needs `drift.resolve` plus a `SessionStart` read-only banner. Hydration and re-sync need a single mechanism: the `Stop` hook detects changed files, blocks, and emits an instruction to the main agent; the main agent launches a registered custom sub-agent (`drift-reconciler`) via the Task/Agent mechanism; that sub-agent invokes the `drift-sync` skill and returns essentially nothing to the main session. The work is scoped to the files worked on this turn (worked-on-only/piecemeal) so diagrams hydrate lazily and token cost stays minimal.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A `drift` **MCP server** exposes the small **user-facing** surface — at minimum `drift.resolve(id, resolution)` (write: reattach/delete from the re-attachment bin) and `drift.list(scope?)` (read) — registered and callable from a user session; each call is logged with timestamp + caller. (No audit table is reserved in task-27.0; this is plain call logging, not a reserved audit path.) The reconciliation sub-agent does **not** go through MCP and does **not** write the store directly — it invokes the `drift-sync` skill (AC#2a). Transport, tool schemas, and the server's location relative to the VSCode extension are pinned
- [ ] #2 The **reconciliation path** is a registered Claude Code **custom sub-agent** plus the `Stop`-hook mechanism that hands it work — not a harness primitive and not a detached process. (a) A custom sub-agent definition ships at `.claude/agents/drift-reconciler.md` (Task/Agent mechanism), registered by the installer (AC#3). (b) The `Stop` hook **blocks**, hands the main agent the changed-file list, and emits an instruction to launch `drift-reconciler` for those files; a `stop_hook_active` loop guard plus a "no new drift → no-op" check prevent reconcile loops. (c) The sub-agent performs all store mutation by invoking the `drift-sync` skill (AC#2a), never by writing the store directly and never via MCP, and **returns essentially nothing** to the main session. "Bounded context rot" is the property: the work runs inside the sub-agent's own context and only a minimal acknowledgement returns to the main session. Any model call this task needs happens **inside the sub-agent's own run** — there is no separate synchronous `invoke_agent` primitive
- [ ] #2a A **`drift-sync` skill** — a SKILL.md (the HYDRATE judgement: group seeds into umbrellas, infer bridges, attach docs, draft descriptions) bundled with a deterministic store-mutation **script** — is the single thing the sub-agent invokes. Given a changed-file set it re-extracts, re-induces the affected flow(s), preserves user edits, and writes the store — or **hydrates** a flow's diagram for the first time when none exists. task-27.1.1 ships its **contract** (the SKILL.md scaffold + the bundled script's signature, inputs, exit semantics, the hydrate-vs-resync dispatch) plus a **stub** (SKILL.md scaffold + a script that no-ops/logs); the body lands in task-27.1.6. Hosts without the Skill tool run the bundled script directly. The MCP `drift.*` surface is independent and stays user-facing only
- [ ] #3 A **hook + sub-agent installer** registers exactly **two** hook entries and is idempotent: (i) a **`Stop`** hook that, on session stop, detects changed files and — when there is new drift or an un-hydrated worked-on flow — blocks and emits the instruction for the main agent to launch the `drift-reconciler` custom sub-agent (per AC#2); a `stop_hook_active` guard and "no new drift → no-op" make it safe to re-fire; and (ii) a **`SessionStart`** hook that is **read-only**: it shows an "outstanding drift" banner of already-detected drift on session open and never reconciles. The installer also installs the **custom sub-agent definition** (`.claude/agents/drift-reconciler.md`), the **`drift-sync` skill bundle** (SKILL.md + bundled script), and a **`/drift` fallback slash command** for hosts without the `Stop` hook. It abstracts its **install target** (path + envelope) behind a host-keyed layout rather than hardcoding `.claude/settings.json`; v1 ships only the Claude-Code target, and adding a Cursor / `.agents` / `.codex` target is an added layout entry, not a caller refactor (keeps the portability-scope decision open — see task-27.1.8). The reconcile trigger is the `Stop` hook alone; the main agent launches the registered sub-agent (D-SUBAGENT-TRIGGER reverted: no detached process, no auto-spawn)
- [ ] #4 A documented **host × surface degradation matrix** keyed on `{Stop hook present?, SessionStart present?, custom sub-agent supported?}` per host. Where a host lacks the `Stop` hook, reconciliation degrades to the **`/drift`** slash command (manual trigger). Where a host lacks `SessionStart`, the outstanding-drift banner degrades to a `/drift` listing or an MCP pull of outstanding drift. Where a host lacks custom sub-agents, reconciliation degrades to a documented manual/MCP path. The MCP `drift.*` tools are the universal user-facing fallback. The matrix reserves known future rows (the neutral `.agents/skills/` path; OpenCode's hooks-via-JS-plugin gap) without building them now
- [ ] #5 The substrate degrades gracefully on a host without the store (task-27.0.1's `NullGraphStore`) — the MCP `drift.*` tools and the `drift-sync` skill return empty/no-op rather than throwing
- [ ] #6 Tests cover: `drift.resolve`/`drift.list` registered + call-logged + no-op on `NullGraphStore`; installer idempotency (re-run leaves one `Stop` + one `SessionStart` entry, one sub-agent file, one `drift-sync` skill, one `/drift` command); the `Stop` hook emits the reconcile instruction with the changed-file list and respects `stop_hook_active`; the `SessionStart` banner is read-only (never reconciles); the `drift-sync` skill stub honors its contract signature

<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **`drift` MCP server:** a new entry (package or VSCode extension surface) exposing `drift.resolve`/`drift.list`; pin the `@modelcontextprotocol/sdk` version, transport (stdio vs SSE), and tool schemas; wrap every call in a plain call-log row (timestamp + caller); no-op on `NullGraphStore`. User-facing only.
2. **Reconciliation sub-agent + `drift-sync` skill contract:** author the custom sub-agent definition `.claude/agents/drift-reconciler.md` (its job: take a changed-file set, invoke the `drift-sync` skill, return a minimal acknowledgement). Define the **`drift-sync` skill contract** — the SKILL.md scaffold + the bundled script's signature, the changed-file-set input, the hydrate-vs-resync dispatch, exit semantics — and ship a **stub** (SKILL.md scaffold + a script that logs/no-ops). (Body lands in task-27.1.6.)
3. **`Stop`-hook reconcile mechanism:** the `Stop` hook computes the changed-file set, applies the `stop_hook_active` guard and the "no new drift / nothing to hydrate → no-op" check, and on real work **blocks** and emits the main-agent instruction to launch `drift-reconciler` over those files.
4. **Hook + sub-agent + skill installer:** idempotently install the `Stop` hook, the read-only `SessionStart` banner hook, the `drift-reconciler` sub-agent file, the `drift-sync` skill bundle, and the `/drift` fallback command, behind a host-keyed install target (Claude-Code target only in v1).
5. **Degradation matrix:** a small table mapping `{host}` × `{Stop hook?, SessionStart?, custom sub-agent?}` to the live or fallback (`/drift` / MCP) surface; reserve the `.agents/skills/` and OpenCode rows.
6. **Tests:** MCP tools registered + call-logged + `NullGraphStore` no-op; installer idempotency; `Stop` hook emits the instruction and honors `stop_hook_active`; `SessionStart` banner is read-only; the `drift-sync` skill stub honors its contract.

<!-- SECTION:PLAN:END -->

## Implementation Notes

### Change detection — `Stop` hook payload (researched against the Claude Code hooks reference)

The `Stop` hook receives `session_id`, `transcript_path`, `cwd`, `permission_mode`, `effort`, `hook_event_name` (plus `agent_id`/`agent_type` in sub-agent context) — **not** a direct edited-file list. The canonical way to learn which files were worked on this turn is to **parse `transcript_path` (JSONL)** for `Edit`/`Write`/`MultiEdit`/`NotebookEdit` tool-use entries, which carry `file_path` and the actual edit content (`old_string`/`new_string`/`content`) — so reconciliation can be scoped to the exact files, even the exact edits.

Change-detection ladder:

1. **`Stop` reconcile (in-session):** parse the transcript for edited files → the worked-on flows to hydrate/re-sync.
2. **`SessionStart` banner (out-of-session drift):** the transcript belongs to a prior session, so compare the working tree against the last-reconciled watermark via `git` (working-tree diff / status).
3. **No `git` available:** fall back to our own file hashing — **out of v1 scope**.

Loop guard: re-entrancy is prevented via the `Stop`-hook re-entrancy signal (`stop_hook_active` per the hooks reference) and/or a transcript check that the worked-on set was already reconciled. (Research flagged a possible discrepancy on whether `stop_hook_active` is still in the payload — confirm the exact field against the current hooks reference at implementation.)

<!-- Added when work begins. -->
