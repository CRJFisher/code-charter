---
name: drift-sync
description: >-
  Reconcile code-to-diagram drift
allowed-tools: Bash
---

# drift-sync

Reconcile the diagram store for the changed-file set staged for this turn.

## Run the reconciler

Run the bundled script. It fetches the changed-file set from the pending-reconcile file the Stop hook
staged beside the store, so you pass no file list — only the store path and the repo root. The store
path resolves from `CODE_CHARTER_DB`, falling back to `.code-charter/graph.db` under the repo root:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --store "${CODE_CHARTER_DB:-$PWD/.code-charter/graph.db}" \
  --repo-root "$PWD" \
  --json
```

The staged set is consumed (deleted) after a successful run; a failed run leaves it staged so the
next launch retries it. When you are handed an explicit file list instead (the manual `/drift` path,
where no Stop hook ran and nothing is staged), pass it via `--files "<comma-separated repo-relative
paths>"` — the staged set, if any, is left untouched.

The script is dependency-free; it shells into the built `drift-reconcile` bin (located via the
`DRIFT_RECONCILE_BIN` env var or the `.drift_reconcile_bin` sidecar the installer drops beside this
skill). The bin opens the store, builds the headless Ariadne call graph over the repo, and reconciles
each affected flow. The `--json` output is one record per flow: `{ flow_id, action, kind, member_count,
last_synced_at }`, where `action` is `hydrate`, `resync`, or `retire` (an empty file set or no
affected flows emits `[]`; a retire record carries `member_count: 0` and `last_synced_at: null`).
A flow whose stored seed no longer resolves is retired only when the reconciled set includes the
seed's file and the graph indexed it cleanly; a retirement skipped because the graph looked
untrustworthy (it came back empty, or the seed's file failed to index or yields no symbols) is
deferred and reported on stderr. A seed-gone flow whose file is outside the reconciled set is
simply left until that file next changes.

## What it does, per flow

For each flow derived from the changed files:

- **HYDRATE** (no `agentic.flow` node exists yet) — group the deterministic seeds into a functionality
  umbrella, infer `agentic.bridge` cross-links, attach docs, draft member descriptions, then write the
  new flow on the agentic lane and stamp `last_synced_at`.
- **RE-SYNC** (a diagram already exists) — re-extract and re-induce the flow in place, re-anchoring
  relocated content via the resolver and re-stamping `last_synced_at`.
- **RETIRE** (the flow is superseded) — soft-delete it: either its stored seed entrypoint no longer
  resolves (gone or renamed away; a rename hydrates a fresh flow under the new id in the same run),
  or a flow written this run demoted its entrypoint (a new wrapper caller) and subsumes its members.

The diagram always updates; it never gates on the user. Agentic descriptions are regenerated each
sync, so content whose anchor no longer resolves is regenerated rather than stranded.

The re-sync path routes through exactly one in-process funnel, `@code-charter/core`'s
`re_extract(file_set, origin='code-change')`: it invalidates the raw tier for the files, re-runs the
headless extractor, rebuilds the file-module scaffold, and resolves every preserved node's anchor —
re-anchoring a relocated symbol inline (an unchanged body is a content-hash cache hit, so its
description rides across the rename). Writes are scoped (per-row upserts + field writes), so
hydrating one flow never disturbs another.

## Member descriptions

Descriptions are deterministic-first: a member with a docstring or frontmatter uses it; the rest get a
name placeholder. No model call is required, so a flow hydrates headlessly. The describe step is an
injectable seam — you can supply short descriptions for the members being described to improve their readability.

## Contract

- Inputs: `--store` (db path) and `--repo-root` (absolute repo root). The file set defaults to the
  staged pending-reconcile file (`drift_pending_reconcile.json` beside the store), consumed on
  success; `--files` (comma-separated repo-relative paths) overrides it for the manual path and
  leaves the staged set untouched. Optional `--json` emits per-flow records; `--dry-run` runs
  detection with no store mutation and never consumes the staged set.
- Dispatch: hydrate when `EXISTS(agentic.flow node)` is false for the flow, else re-sync.
- Exit 0 = success or no-op (an empty file set, nothing staged, or an absent/Null store all no-op).
  Exit 2 = usage/contract error. Diagnostics go to stderr; `--json` records go to stdout.
- Hosts without the Skill tool run `scripts/drift_sync.js` directly with the same arguments.
