# @code-charter/drift

The drift infrastructure substrate for Code Charter's code→diagram half: the user-facing `drift`
MCP surface, the `Stop`-hook → custom sub-agent reconciliation path, the `drift-sync` skill the
sub-agent invokes, and the installer that wires all of it into a host's `.claude` directory.

This package ships the substrate and its contracts. The reconciliation body (re-extract →
re-induce → preserve → write) is a stub here; it lands in task-27.1.6.

## What it provides

- **MCP server** (`drift-mcp` bin) — the user-facing `drift.*` tools, served over stdio:
  - `drift.list(scope?)` — read the re-attachment bin (soft-deleted agentic/user diagram content).
  - `drift.resolve(id, resolution)` — `reattach` (restore) or `delete` (keep removed) a bin entry.
  - Each call is logged (timestamp + caller) to `.code-charter/drift-mcp.log`. On a host without
    the SQLite engine the tools return empty/no-op rather than throwing.
  - Registered names are `drift_list` / `drift_resolve` (a dot in an MCP tool name is rejected by
    clients that flatten the namespace); the conceptual surface is the `drift.*` family.
- **`Stop` hook** (`drift-stop-hook` bin) — parses the session transcript for the files edited
  this turn and, unless `stop_hook_active` is set or nothing was edited, blocks the stop and
  instructs the main agent to launch the `drift-reconciler` sub-agent over those files.
- **`SessionStart` hook** (`drift-session-start` bin) — a read-only banner listing outstanding
  working-tree drift. It never reconciles and never blocks.
- **`drift-reconciler` sub-agent** + **`drift-sync` skill** — the reconciliation path. The
  sub-agent invokes the skill; the skill's bundled script is the single store-mutation path.
- **Installer** (`drift-install` bin) — idempotently installs the two hooks, the MCP server
  registration, the sub-agent, the skill bundle, and the `/drift` fallback command, behind a
  host-keyed layout. v1 ships only the Claude-Code target.

## Host × surface degradation matrix

Reconciliation and the drift banner degrade gracefully where a host lacks a primitive. The MCP
`drift.*` tools are the universal user-facing fallback.

| Host | `Stop` hook | `SessionStart` | Custom sub-agent | Reconcile path | Banner path | User-facing fallback |
| ---- | ----------- | -------------- | ---------------- | -------------- | ----------- | -------------------- |
| **Claude Code** (v1) | yes | yes (read-only) | yes | `Stop` → `drift-reconciler` → `drift-sync` | `SessionStart` banner | `drift.*` MCP |
| Cursor | no | no | no (TBD) | `/drift` (manual) | `/drift` listing or `drift.list` pull | `drift.*` MCP |
| `.agents` (neutral) | reserved | reserved | reserved (`.agents/skills/`) | `/drift` | `drift.list` pull | `drift.*` MCP |
| `.codex` / OpenCode | no (hooks-via-JS-plugin gap) | no | TBD | `/drift` | `drift.list` pull | `drift.*` MCP |

Degradation rules:

- **No `Stop` hook** → reconciliation degrades to the `/drift` slash command (manual trigger).
- **No `SessionStart`** → the outstanding-drift banner degrades to a `/drift` listing or an MCP
  pull of outstanding drift (`drift.list`).
- **No custom sub-agents** → reconciliation degrades to invoking the `drift-sync` skill / its
  bundled script directly, or to the MCP path.

The Cursor, `.agents`, and `.codex`/OpenCode rows are reserved and documented only — not built in
v1. Adding a target is a new `HostLayout` entry in `src/installer/host_layout.ts`, not a caller
refactor (task-27.1.8).
