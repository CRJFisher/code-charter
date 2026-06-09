# @code-charter/drift

The drift infrastructure substrate for Code Charter's code→diagram half: the user-facing `drift`
MCP surface, the `Stop`-hook → custom sub-agent reconciliation path, the `drift-sync` skill the
sub-agent invokes, and the installer that wires all of it into a host's `.claude` directory.

This package ships the substrate and its contracts. The reconciliation body — re-extract →
re-induce → write — runs inside the `drift-sync` skill the sub-agent invokes. The `drift.resolve`
MCP tool commits a staged re-anchor: when a code rename relocates a symbol, the re-sync stages the
move as outstanding drift, and `drift.resolve {reanchor}` commits the diagram content onto the
renamed symbol.

## Layout

- `src/mcp/` — the user-facing MCP surface: the `drift.*` pure handlers, call logging, the server
  builder, and the store-path resolver.
- `src/hooks/` — the `Stop` and `SessionStart` logic: transcript parsing, the block-or-no-op
  decision, the read-only banner, and git-based out-of-session drift detection.
- `src/installer/` — the idempotent installer and the host-keyed layout (where each artifact lands
  per host, and the non-destructive settings/MCP merges).
- `src/bin/` — the thin executable entries the installer wires into a host (`drift-mcp`,
  `drift-stop-hook`, `drift-session-start`, `drift-install`).
- `assets/` — the `.claude` templates the installer copies verbatim: the `drift-reconciler`
  sub-agent (`agents/`), the `drift-sync` skill (`skills/`), and the `/drift` command (`commands/`).

## Install

Build the package, then run the installer from the target repository root (it installs into the
repo's `.claude/` directory and `.mcp.json`):

```bash
npm run build --workspace=@code-charter/drift
node <path-to>/packages/drift/dist/bin/drift_install.js   # the `drift-install` bin
```

The installer writes runtime artifacts under `.code-charter/` (the graph store and the MCP call
log); add that directory to the repo's `.gitignore` if it is not already ignored.

## What it provides

- **MCP server** (`drift-mcp` bin) — the user-facing `drift.resolve` tool, served over stdio:
  - `drift.resolve({ kind, id, resolution: "reanchor" })` — commit a staged relocation, moving the
    diagram content onto the renamed symbol. A `kind`/`id` that carries no outstanding drift is a no-op.
  - Each call is logged (timestamp + caller) to `.code-charter/drift-mcp.log`. On a host without
    the SQLite engine the tool returns a no-op rather than throwing.
  - The registered name is `drift_resolve` (a dot in an MCP tool name is rejected by clients that
    flatten the namespace); the conceptual surface is the `drift.*` family.
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
| Cursor | no | no | no (TBD) | `/drift` (manual) | `/drift` listing | `drift.*` MCP |
| `.agents` (neutral) | reserved | reserved | reserved (`.agents/skills/`) | `/drift` | `/drift` listing | `drift.*` MCP |
| `.codex` / OpenCode | no (hooks-via-JS-plugin gap) | no | TBD | `/drift` | `/drift` listing | `drift.*` MCP |

Degradation rules:

- **No `Stop` hook** → reconciliation degrades to the `/drift` slash command (manual trigger).
- **No `SessionStart`** → the outstanding-drift banner degrades to a `/drift` listing.
- **No custom sub-agents** → reconciliation degrades to invoking the `drift-sync` skill / its
  bundled script directly, or to the MCP path.

The Cursor, `.agents`, and `.codex`/OpenCode rows are reserved and documented only — not built in
v1. Adding a target is a new `HostLayout` entry in `src/installer/host_layout.ts`, not a caller
refactor (task-27.1.8).
