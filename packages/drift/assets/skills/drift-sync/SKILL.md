---
name: drift-sync
description: >-
  Reconcile code-to-diagram drift for the changed-file set the Stop hook staged: hydrate a flow's
  diagram the first time its code is worked on, or re-sync an existing flow. Invoked by the
  drift-reconciler sub-agent; the bundled script fetches the staged set itself. Runs in two
  judgement phases — you stitch fragmented entrypoints by exploring the codebase, then author
  member descriptions. It always updates the diagram and never asks permission.
allowed-tools: Bash, Read, Grep
---

# drift-sync

Reconcile the diagram store for the changed-file set staged for this turn.

This skill is the single store-mutation path for drift reconciliation. Every store write goes
through the bundled script `scripts/drift_sync.js`, which shells into the built `drift-reconcile`
bin (located via the `DRIFT_RECONCILE_BIN` env var or the `.drift_reconcile_bin` sidecar the
installer drops beside this skill). You never write the store through any other tool.

Reconciliation is two judgement phases bracketed by deterministic store writes. Ariadne is a
syntactic call-graph extractor: dynamic dispatch, registry lookups, callback wiring, and every
other indirection it cannot follow leave call edges unresolved — the failure set is open-ended —
so one functionality fragments into several singleton flows, one per spuriously-promoted
entrypoint. The scripts do the deterministic reads and writes; you do the
judging: which fragments are one functionality (phase 1), and what each member does (phase 2).

The store path resolves from `CODE_CHARTER_DB`, falling back to `.code-charter/graph.db` under the
repo root. Every command below uses these values:

```bash
STORE="${CODE_CHARTER_DB:-$PWD/.code-charter/graph.db}"
```

## Phase 1 — list and stitch

**1. Run the list pass.** It runs the full deterministic reconcile (resync, retire, skill-dir,
one-singleton-flow-per-new-entrypoint hydration, and the stale-flow sweep that retires flows whose
seed files or SKILL.md are gone from disk) over the staged set, then emits the changed
neighbourhood's entrypoint inventory on stdout:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --list-entrypoints --store "$STORE" --repo-root "$PWD"
```

The staged set is fetched from the pending-reconcile file the Stop hook wrote beside the store and
is consumed on success — pass no file list. On the manual `/drift` path (no Stop hook ran, nothing
staged) add `--files "<comma-separated repo-relative paths>"`; the staged set, if any, is left
untouched. The inventory is
`{ entrypoints: [{ symbol_path, name, file, line, is_orphan, members: [{ name, kind, docstring_first_line?, description? }], described_coverage: { docstring, provisional, placeholder, llm }, unresolved_sites: [{ file, line, source_line }] }] }`
— every entrypoint in the changed files, each carrying its reachable tree's members as a semantic
fingerprint and the unresolved call sites. A member's `description` appears only when a prior
agent-authored sentence exists; `docstring_first_line` is the code's own summary, and a member with
neither carries just its name. `described_coverage` counts the entrypoint's members by description
source: `docstring`/`llm` are real text, `provisional`/`placeholder` are name-only stand-ins. A
member not yet described appears in no bucket, so the buckets can sum to fewer than the member
count — treat the shortfall as undescribed too. Coverage is a triage hint about which flows carry
the real authoring work; phase 2 still authors every member, since the description cache makes
re-describing an already-described member free. `is_orphan: true` means no documentation edge links
the entrypoint — the spuriously-promoted-fragment signal; weight your stitching toward orphans,
since a doc-linked entrypoint is usually a genuine flow root.

**2. Short-circuit on an empty inventory.** No entrypoints → the deterministic output already
stands; report the one-line acknowledgement and stop, with neither judgement phase run. An
inventory whose orphans all carry zero `unresolved_sites` does **not** short-circuit: some misses
record no call site at all, so zero recorded sites is itself a failure shape — judge it in step 3.

**3. Rank the candidates, then judge by exploring.** Rank first, read second: each entrypoint's
`members` (names, kinds, docstring first lines, prior descriptions) is its tree's vocabulary —
before reading any code, rank candidate pairs by name/description similarity across their members,
since entrypoints whose members share vocabulary are the likely fragments of one functionality.
Ranking orders where you spend your reads; it is never evidence — confirm each top candidate
against the evidence below: its unresolved call site, or, for a site-less orphan, its definition
and real references. Ariadne misses call edges for many reasons — do not assume a known
taxonomy of failure shapes; search generically, from both ends of the missing edge:

- **From the call site.** For each entrypoint with `unresolved_sites`, Read the `source_line` at
  its `file:line` and the enclosing definition. Take whatever name the site calls (a variable, a
  member, a lookup result) and Grep for where that name is defined, assigned, registered, or
  exported; read the candidates and decide what the call actually reaches.
- **From the orphan.** Some misses leave no recorded call site at all, so an orphan can carry
  zero `unresolved_sites` and still be a fragment. For each orphan, Read its definition and Grep
  for its _name_ across the codebase — imports, re-exports, registrations, callbacks, member
  references, string keys. A real reference that connects it into another entrypoint's
  functionality justifies a stitch. A call in the orphan's own body that resolves to no member
  and appears in no `unresolved_sites` is an unrecorded miss — Grep the called name to find the
  definition it reaches. That definition may itself be absent from the inventory (a re-export,
  for example, counts as its only reference and keeps it off the entrypoint list); it is still a
  valid seed.

Decide which entrypoints belong to one functionality. Never invent a bridge you have not read the
call site for: every bridge points from the entrypoint whose tree encloses a real unresolved site
to the seed it actually reaches. When the connection is real but no recorded unresolved site
exists to cite, stitch **without a bridge** — a seeds-only umbrella merges the membership, and
the rationale carries the explanation.

**4. Apply the stitches.** Write your judgement beside the store as `stitch.json`:

```json
{
  "umbrellas": [
    {
      "label": "request dispatch flow",
      "seeds": [
        "handler.ts#dispatch:function",
        "router.ts#handle_request:function"
      ],
      "bridges": [
        {
          "src_id": "handler.ts#dispatch:function",
          "dst_id": "router.ts#handle_request:function",
          "file": "handler.ts",
          "line": 5,
          "rationale": "fn() is the registry-looked-up handler; handle_request is the registered target"
        }
      ],
      "rationale": "dispatch reaches handle_request through the route() registry lookup"
    }
  ]
}
```

`seeds` are `symbol_path`s — usually copied from the inventory, but a fragment your exploration
found that the inventory never promoted is seeded in the same flow-layer format
(`file#name:kind`, kind `function` or `method`) and resolves against the live graph; an
unresolvable seed is skipped with a diagnostic. A bridge's `file`/`line` name the unresolved call site,
copied verbatim from the inventory's `unresolved_sites` (`file` defaults to `src_id`'s file); the
bin resolves them to the call's exact span so click-through lands on the real missed call, and
skips a bridge whose site the graph cannot corroborate. `dst_id` is one of the umbrella's seeds —
membership derives from the seed union; the bridge is the provenance record of the missed call.
Then apply:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --apply-stitch "$(dirname "$STORE")/stitch.json" --store "$STORE" --repo-root "$PWD"
```

Each umbrella hydrates as one multi-seed flow (id = its alphabetically-first seed's `symbol_path` —
identity stays deterministic, the label is display-only) with `agentic.bridge` edges at
`confidence 0.5`; singleton flows absorbed into an umbrella are retired. stdout returns the
established flow shape: `{ flows: [{ id, members: [{ symbol_path, name }] }] }`.

## Phase 2 — describe

Read each returned flow's members and write **one short but descriptive sentence per member — just
enough to explain what is going on**, not a name restatement and not a paragraph. Write
`descriptions.json` beside the store:

```json
{
  "descriptions": [
    {
      "symbol_path": "handler.ts#dispatch:function",
      "text": "Looks up the registered handler for a key and runs it."
    }
  ]
}
```

Then apply:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/drift_sync.js" \
  --apply-descriptions "$(dirname "$STORE")/descriptions.json" --store "$STORE" --repo-root "$PWD"
```

Author for every member of the returned flows; descriptions persist through the scoped write path,
upgrading the deterministic placeholders. The description cache makes a byte-identical
re-submission at an unchanged content hash a no-op, and a different text is a revision — so
re-describing costs nothing and correcting a stale sentence always lands.

## What it does, per flow

- **HYDRATE** (no `agentic.flow` node exists yet) — the list pass writes one singleton flow per new
  entrypoint, deterministic; your stitch phase merges the fragments that are one functionality and
  your describe phase replaces the placeholder descriptions.
- **RE-SYNC** (a diagram already exists) — re-extract and re-induce the flow in place, re-anchoring
  relocated content via the resolver and re-stamping `last_synced_at`. Rides the list pass,
  headless.
- **RETIRE** (the flow is superseded) — soft-delete it: its stored seed entrypoint no longer
  resolves (gone or renamed away; a rename hydrates a fresh flow under the new id in the same run),
  a flow written this run demoted its entrypoint (a new wrapper caller) and subsumes its members,
  or your stitch absorbed it into a multi-seed umbrella.

The diagram always updates; it never gates on the user. The re-sync path routes through exactly one
in-process funnel, `@code-charter/core`'s `re_extract(file_set, origin='code-change')`: it
invalidates the raw tier for the files, re-runs the headless extractor, rebuilds the file-module
scaffold, and resolves every preserved node's anchor — re-anchoring a relocated symbol inline (an
unchanged body is a content-hash cache hit, so its description rides across the rename). Writes are
scoped (per-row upserts + field writes), so hydrating one flow never disturbs another.

## Guardrails

- **Cost bound.** The inventory covers the changed neighbourhood only, never the whole repo. An
  over-large inventory is reported on stderr — never a silent cap. Stitch only what you can judge
  from the call sites you read; an unstitched orphan stays a singleton flow, which is correct, not
  a gap.
- **Evidence bar.** A bridge requires a read unresolved call site, named by its inventory
  `file`/`line` — the bin verifies the site against the live graph and drops a bridge it cannot
  corroborate. A connection with no citable recorded site is stitched as a seeds-only umbrella
  (no bridge). If you cannot find any real reference connecting two entrypoints, do not stitch
  them.
- **Description bar.** Short but descriptive — what the member does in the flow, one sentence.
- **Identity.** A flow's id is always its dominant seed's `symbol_path`. You choose the grouping
  and the label, never the id.

## Contract

- `--store` (db path) and `--repo-root` (absolute repo root) are required on every call.
- **List**: `--list-entrypoints` runs the deterministic reconcile and emits the inventory JSON on
  stdout. The file set defaults to the staged pending-reconcile file
  (`drift_pending_reconcile.json` beside the store), consumed on success; `--files` overrides it
  for the manual path and leaves the staged set untouched. An empty set or nothing staged no-ops
  with `{ "entrypoints": [] }`. Each entrypoint carries `members` (`{ name, kind,
  docstring_first_line?, description? }` per reachable member; `description` only for a prior
  agent-authored sentence) and a `described_coverage` source split (`{ docstring, provisional,
  placeholder, llm }`) over those members.
- **Apply**: `--apply-stitch <json_path>` consumes `{ umbrellas: [{ label, seeds, bridges,
rationale }] }` and returns the flow shape; `--apply-descriptions <json_path>` consumes
  `{ descriptions: [{ symbol_path, text }] }` and returns `{ written, skipped }`. Neither touches
  the staged set. Unknown seeds, duplicate seed claims, and anchorless descriptions are skipped
  with a stderr diagnostic; a malformed payload is a contract error.
- `--dry-run` runs any mode against a read-only store and never consumes the staged set.
- Exit 0 = success or no-op. Exit 2 = usage/contract error. Exit 1 = fatal (reconcile bin not
  located, spawn failure, or an uncaught engine error) — or reconcile contention: another
  reconcile already holds the per-repo mutex, this run touched nothing, and the staged set is
  preserved for the next launch. Contention is a defer, not an error to escalate; the bin's
  stderr says "another reconcile is running" when this is the cause. Mode JSON goes to stdout;
  diagnostics go to stderr.
- Hosts without the Skill tool run `scripts/drift_sync.js` directly with the same arguments — the
  deterministic list pass is complete on its own (singleton flows, docstring/placeholder
  descriptions); the judgement phases are the agent's refinement on top.
