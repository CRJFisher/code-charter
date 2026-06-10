# @code-charter/drift

The drift infrastructure substrate for Code Charter's code→diagram half: the `Stop`-hook →
custom sub-agent reconciliation path, the `drift-sync` skill the sub-agent invokes, and the
installer that wires all of it into a host's `.claude` directory.

This package ships the substrate and its contracts. The reconciliation body — re-extract →
re-induce → write — runs inside the `drift-sync` skill the sub-agent invokes. A code rename that
relocates a symbol is re-anchored inline by the re-sync: the diagram content rides across to the
renamed symbol in the same pass, with no resolve step.

## Layout

- `src/hooks/` — the `Stop` logic: transcript parsing, the block-or-no-op decision, the per-turn
  watermark, and the pending-reconcile handoff.
- `src/installer/` — the idempotent installer and the host-keyed layout (where each artifact lands
  per host, the non-destructive settings merge, and the store-path resolver).
- `src/bin/` — the thin executable entries the installer wires into a host (`drift-stop-hook`,
  `drift-install`, `drift-reconcile`).
- `assets/` — the `.claude` templates the installer copies verbatim: the `drift-reconciler`
  sub-agent (`agents/`), the `drift-sync` skill (`skills/`), and the `/drift` command (`commands/`).

## Install

Build the package, then run the installer from the target repository root (it installs into the
repo's `.claude/` directory):

```bash
npm run build --workspace=@code-charter/drift
node <path-to>/packages/drift/dist/bin/drift_install.js   # the `drift-install` bin
```

The installer writes runtime artifacts under `.code-charter/` (the graph store); add that
directory to the repo's `.gitignore` if it is not already ignored.

## What it provides

- **`Stop` hook** (`drift-stop-hook` bin) — parses the session transcript for the files edited
  this turn and, unless `stop_hook_active` is set or nothing was edited, stages the set in the
  pending-reconcile file beside the store, blocks the stop, and instructs the main agent to launch
  the `drift-reconciler` sub-agent. The instruction names no files — the skill's script fetches
  and consumes the staged set, keeping the list out of the main agent's context.
- **`drift-reconciler` sub-agent** + **`drift-sync` skill** — the reconciliation path. The
  sub-agent invokes the skill; the skill's bundled script is the single store-mutation path.
- **Installer** (`drift-install` bin) — idempotently installs the `Stop` hook, the sub-agent, the
  skill bundle, and the `/drift` fallback command, behind a host-keyed layout. v1 ships only the
  Claude-Code target.

## Host × surface degradation matrix

Reconciliation degrades gracefully where a host lacks a primitive.

| Host                 | `Stop` hook                  | Custom sub-agent             | Reconcile path                             |
| -------------------- | ---------------------------- | ---------------------------- | ------------------------------------------ |
| **Claude Code** (v1) | yes                          | yes                          | `Stop` → `drift-reconciler` → `drift-sync` |
| Cursor               | no                           | no (TBD)                     | `/drift` (manual)                          |
| `.agents` (neutral)  | reserved                     | reserved (`.agents/skills/`) | `/drift`                                   |
| `.codex` / OpenCode  | no (hooks-via-JS-plugin gap) | TBD                          | `/drift`                                   |

Degradation rules:

- **No `Stop` hook** → reconciliation degrades to the `/drift` slash command (manual trigger).
- **No custom sub-agents** → reconciliation degrades to invoking the `drift-sync` skill / its
  bundled script directly.

The Cursor, `.agents`, and `.codex`/OpenCode rows are reserved and documented only — not built in
v1. Adding a target is a new `HostLayout` entry in `src/installer/host_layout.ts`, not a caller
refactor (task-27.1.8).
