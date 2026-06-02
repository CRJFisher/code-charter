---
name: drift-sync
description: >-
  Reconcile code-to-diagram drift for a changed-file set: hydrate a flow's diagram the first time
  its code is worked on, or re-sync an existing flow, preserving user edits. Invoked by the
  drift-reconciler sub-agent with the files worked on this turn. STUB in task-27.1.1 (logs the
  hydrate-vs-resync decision and no-ops the store); the body lands in task-27.1.6.
allowed-tools: Bash
---

# drift-sync

Reconcile the diagram store for the changed-file set you were given.

This skill is the single store-mutation path for drift reconciliation. The deterministic work is
performed by the bundled script `scripts/drift_sync.js`, which you run directly. You do not write
the store through any other tool, and never through the MCP `drift.*` surface.

## Run the reconciler

Run the bundled script over the changed files. Pass the comma-separated file set, the store path,
and the repo root. The store path resolves from `CODE_CHARTER_DB` (the same env var the MCP server
uses), falling back to `.code-charter/graph.db` under the repo root — so the skill and the MCP
server always open the same store:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --files "<comma-separated repo-relative paths>" \
  --store "${CODE_CHARTER_DB:-$PWD/.code-charter/graph.db}" \
  --repo-root "$PWD" \
  --json
```

For each affected flow the script reports whether it would HYDRATE (no `agentic.flow` node exists
yet for that flow) or RE-SYNC (one already exists). In task-27.1.1 this is a stub: it logs the
decision and performs no store mutation, exiting 0.

## What the full skill does (task-27.1.6)

For each affected flow derived from the changed files:

- when no diagram exists yet, apply the HYDRATE judgement — group seeds into umbrellas, infer
  bridges, attach docs, draft descriptions — then write the new flow; or
- when a diagram already exists, re-extract and re-induce the flow and carry user-authored fields
  (description, name, pin) across via the resolver + watermark ladder,

then write the store under the agentic rebuild layer. User edits always win.

The re-sync path routes through exactly one in-process funnel, `@code-charter/core`'s
`re_extract(file_set, origin='code-change')` (task-27.1.2): it invalidates the raw tier for the
files, re-runs the extractor, rebuilds the file-module scaffold, and resolves every preserved node's
anchor — staging a `relocated` verdict as outstanding drift the next session surfaces and
`drift.resolve {reanchor}` commits. The Stop-hook reconciliation path and the consistency engine are
its only callers, both passing `origin='code-change'`. What task-27.1.6 adds here is the headless
extractor injection (running the parser over the changed files to feed `re_extract`) and the HYDRATE
judgement — not a second re-extraction path.

## Contract (stable now)

- Inputs: `--files` (comma-separated repo-relative paths), `--store` (db path), `--repo-root`
  (absolute repo root). Optional `--json` emits machine-readable dispatch records; `--dry-run`
  forces the no-mutation path (the stub is always dry-run).
- Dispatch: hydrate when `EXISTS(agentic.flow node)` is false for the flow, else re-sync.
- Exit 0 = success or no-op (an empty file set or an absent/Null store both no-op). Exit 2 =
  usage/contract error. Diagnostics go to stderr; `--json` records go to stdout.
- Hosts without the Skill tool run `scripts/drift_sync.js` directly with the same arguments.
