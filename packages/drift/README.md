# @code-charter/drift

The drift infrastructure substrate for Code Charter's code→diagram half: the `Stop`-hook →
custom sub-agent reconciliation path, the `drift-sync` skill the sub-agent invokes, and the
installer that wires all of it into a host's `.claude` directory.

This package ships the substrate and its contracts. The reconciliation body — re-extract →
re-induce → write — is this package's reconcile engine (`src/reconcile/`), which the `drift-sync`
skill's dependency-free script shells into via the `drift-reconcile` bin. A code rename that
relocates a symbol is absorbed inline by the re-sync: the diagram content is re-anchored onto the
renamed symbol in the same pass, with no resolve step (at the flow level the old flow id is retired
and a fresh flow hydrates under the new id; descriptions ride across).

## Layout

- `src/hooks/` — the `Stop` logic: transcript parsing, the block-or-no-op decision, the per-turn
  watermark, the pending-reconcile handoff, and the store-path resolver.
- `src/reconcile/` — the reconcile engine behind the `drift-reconcile` bin: hydrate / re-sync /
  retire dispatch over affected flows, the headless Ariadne adapter, and the flow store.
- `src/skill/` — the contract test pinning the bundled `drift_sync.js` script to the bin.
- `src/installer/` — the idempotent installer and the host-keyed layout (where each artifact lands
  per host, and the non-destructive settings merge).
- `src/bin/` — the thin executable entries the installer wires into a host (`drift-stop-hook`,
  `drift-install`, `drift-reconcile`).
- `assets/` — the `.claude` templates the installer copies verbatim: the `drift-reconciler`
  sub-agent (`agents/`), the `drift-sync` skill (`skills/`), and the `/drift` command (`commands/`).

## Install

Build the package, then run the installer from the target repository root (it installs into the
repo's `.claude/` directory):

```bash
npx turbo run build --filter=@code-charter/drift   # builds the dependency chain (types, core) too
node <path-to>/packages/drift/dist/bin/drift_install.js   # the `drift-install` bin
```

The installer writes runtime artifacts under `.code-charter/` (the graph store); add that
directory to the repo's `.gitignore` if it is not already ignored. Beside the store you may also
see `drift_pending_reconcile.json` (the staged changed-file handoff),
`drift_pending_reconcile.claim.<pid>.json` (a reconcile's transient working copy of that handoff
— deleted on success, recovered automatically on the next launch when its pid is dead, safe to
delete manually when no reconcile is running) and `drift_reconcile.lock` — the single-reconcile
mutex, held only while a reconcile runs. A lock whose recorded pid is dead is reclaimed
automatically; deleting it manually is safe when no reconcile is running.

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

## Iterating on reconcile logic (deterministic dev loop)

A purely deterministic reconcile change — one that touches resync / retire / singleton hydration and
needs no agent judgement — is provable in seconds without a Claude session or a token spend. Build
the package first, then run one of these from `packages/drift/`:

- **`drift:dev`** — the single-command loop. It copies the target repo's graph store to a scratch
  location, runs the real deterministic reconcile against the copy, and prints a before/after diff of
  flows, descriptions, and bridges. The real store is never touched and no agentic mode runs.

  ```bash
  npm run drift:dev -- --repo <abs-repo-path> --files <changed,files,csv>
  ```

  `--store <db_path>` overrides the store (default: the repo's `.code-charter/graph.db`, honoring the
  `CODE_CHARTER_DB` env override); `--goal <name>` overrides the detection goal; `--json` emits
  `{ outcomes, diff }` instead of the text diff.

- **`drift:dryrun`** — the thin wrapper over `drift-reconcile --dry-run`. It runs the same detection
  against the **real** store read-only (write-swallowed via `dry_run_store`) and reports the would-be
  outcomes without mutating anything. Unlike `drift:dev` it takes no scratch copy, so it shows the
  action list rather than a resulting-state diff.

  ```bash
  npm run drift:dryrun -- --store <db_path> --repo-root <abs> --files <changed,files,csv> [--json]
  ```

From the editor, the **Code Charter: Preview Drift Reconcile (dev)** command (visible only when the
`code-charter-vscode.devMode` setting is on) runs `drift-reconcile --dry-run` over the workspace's
current diff (tracked edits + untracked files vs `HEAD`) and prints the would-be outcomes to the
**Code Charter** OutputChannel.

## Tuning the stitching prompts

The agent's stitch/describe judgement is authored in `assets/agents/drift-reconciler.md` and
`assets/skills/drift-sync/SKILL.md`. Measure a prose edit with the two-tier stitch eval over the
mini-codebase fixtures in `src/reconcile/__fixtures__/stitch_eval/` (each named by the Ariadne
resolution weakness it contains):

- **Tier 1** (`src/reconcile/reconcile_stitch_eval.test.ts`, runs in CI) — the deterministic
  contract: the built bin's three agentic modes replayed with golden JSON per fixture.
- **Tier 2** (`src/bin/stitch_eval.ts`) — the live loop: per fixture, a throwaway repo gets the
  installed bundle and the real `drift-reconciler` runs via `claude -p`; the store is scored and a
  per-fixture report lands in `.stitch_eval_runs/`. Build first, then:

```bash
STITCH_EVAL_LIVE=1 npm run stitch_eval            # all fixtures; one fixture: append its name
```

`STITCH_EVAL_MODEL` overrides the haiku default; `STITCH_EVAL_KEEP=1` keeps the temp repos.

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
