---
name: drift-sync
description: >-
  Reconcile code-to-diagram drift for a changed-file set: hydrate a flow's diagram the first time
  its code is worked on, or re-sync an existing flow, preserving user edits. Invoked by the
  drift-reconciler sub-agent with the files worked on this turn. It always updates the diagram and
  never asks permission; user-authored content is recalled and re-applied.
allowed-tools: Bash
---

# drift-sync

Reconcile the diagram store for the changed-file set you were given.

This skill is the single store-mutation path for drift reconciliation. The work is performed by the
bundled script `scripts/drift_sync.js`, which you run directly. You do not write the store through any
other tool, and never through the MCP `drift.*` surface.

## Run the reconciler

Run the bundled script over the changed files. Pass the comma-separated file set, the store path, and
the repo root. The store path resolves from `CODE_CHARTER_DB` (the same env var the MCP server uses),
falling back to `.code-charter/graph.db` under the repo root — so the skill and the MCP server always
open the same store:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --files "<comma-separated repo-relative paths>" \
  --store "${CODE_CHARTER_DB:-$PWD/.code-charter/graph.db}" \
  --repo-root "$PWD" \
  --json
```

The script is dependency-free; it shells into the built `drift-reconcile` bin (located via the
`DRIFT_RECONCILE_BIN` env var or the `.drift_reconcile_bin` sidecar the installer drops beside this
skill). The bin opens the store, builds the headless Ariadne call graph over the repo, and reconciles
each affected flow. The `--json` output is one record per flow: `{ flow_id, action, kind, member_count,
last_synced_at }`, where `action` is `hydrate` or `resync` (an empty file set or no affected flows
emits `[]`).

## What it does, per flow

For each flow derived from the changed files:

- **HYDRATE** (no `agentic.flow` node exists yet) — group the deterministic seeds into a functionality
  umbrella, infer `agentic.bridge` cross-links, attach docs, draft member descriptions, then write the
  new flow on the agentic lane and stamp `last_synced_at`.
- **RE-SYNC** (a diagram already exists) — re-extract and re-induce the flow in place, carrying
  user-authored fields (description, name, pin) across via the resolver + watermark ladder, and re-stamp
  `last_synced_at`.

The diagram always updates; it never gates on the user. User edits always win — an agentic write that
would overwrite a user-owned field is skipped by the ladder, and content whose anchor no longer resolves
goes to the recoverable re-attachment bin, never auto-pruned.

The re-sync path routes through exactly one in-process funnel, `@code-charter/core`'s
`re_extract(file_set, origin='code-change')`: it invalidates the raw tier for the files, re-runs the
headless extractor, rebuilds the file-module scaffold, and resolves every preserved node's anchor —
staging a `relocated` verdict as outstanding drift the next session surfaces and `drift.resolve
{reanchor}` commits. Writes are scoped (upsert + ladder-aware `write_fields`), so hydrating one flow
never disturbs another.

## Member descriptions

Descriptions are deterministic-first: a member with a docstring or frontmatter uses it; the rest get a
name placeholder. No model call is required, so a flow hydrates headlessly. The describe step is an
injectable seam — you MAY supply short descriptions for members the bin reports as needing them — but v1
never requires it; the default is the deterministic path.

## Contract

- Inputs: `--files` (comma-separated repo-relative paths), `--store` (db path), `--repo-root`
  (absolute repo root). Optional `--json` emits per-flow records; `--dry-run` runs detection with no
  store mutation.
- Dispatch: hydrate when `EXISTS(agentic.flow node)` is false for the flow, else re-sync.
- Exit 0 = success or no-op (an empty file set or an absent/Null store both no-op). Exit 2 =
  usage/contract error. Diagnostics go to stderr; `--json` records go to stdout.
- Hosts without the Skill tool run `scripts/drift_sync.js` directly with the same arguments.
