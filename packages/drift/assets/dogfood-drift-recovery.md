# Dogfooding the drift recovery loop

A copy-paste walkthrough for driving the `drift.*` MCP recovery surface against a real stranding in a
live Claude Code session. It exercises the path a user follows after a rename strands a hand-written
description: the `SessionStart` banner points the way, `drift.list` shows what is recoverable, and
`drift.resolve` puts it back.

## Prerequisites

- A project with the drift MCP server and the `Stop`/`SessionStart` hooks installed (run the drift
  installer; the store lives at `.code-charter/graph.db`).
- At least one flow already hydrated for the code you are about to change, carrying a hand-written
  description on a function (author one and let the `Stop`-hook auto-sync persist it).

## Two strandings, two resolutions

The surface distinguishes how badly a symbol moved:

- **Relocated** — you rename a function but leave its body unchanged. The description is *staged*, not
  binned: it stays live and `SessionStart` reports it as outstanding drift. Recover with
  `drift.resolve { id, resolution: "reanchor" }` — the description re-anchors onto the renamed symbol.
- **Miss** — you rename *and* change the body, so the old anchor resolves nowhere. The description is
  *binned* (soft-deleted) and appears in `drift.list`. Recover with
  `drift.resolve { id, resolution: "reattach" }` to restore it, or `"delete"` to keep it removed.

## Walkthrough

Both loops start the same way, then diverge on whether the symbol relocated or was missed. Open a new
session after the edit and read the `SessionStart` banner — it tells you which loop you are in.

### Common start

1. **Strand a description.** Pick a function that carries a hand-written description and edit it so the
   `Stop`-hook auto-sync re-extracts the file, then end the turn:
   - For **Loop A (relocation)**: rename only, leaving the body unchanged (e.g. `compute` → `calculate`,
     body still `a + b`).
   - For **Loop B (miss)**: rename *and* change the body (e.g. `compute` returning `a + b` → `calculate`
     returning `a * b - 1`).

2. **Open a new session and read the banner.** The `SessionStart` banner reports outstanding drift. A
   relocation prints `from → to (relocated; node <id>)` — note that `<id>`, it is the argument to
   `reanchor`. A miss leaves nothing staged: the banner shows no relocation and the description sits in
   the bin instead. Follow the matching loop below.

### Loop A — recover a relocation (`reanchor`)

3a. **Reanchor from the banner id.** A relocation is *staged*, not binned, so it does **not** appear in
   `drift.list`. Call `mcp__drift__drift_resolve` with the node `id` from the banner:
   `{ id: "<id from banner>", resolution: "reanchor" }`. The description moves onto the renamed symbol.

### Loop B — recover a miss (`reattach` / `delete`)

3b. **List the bin.** Call `mcp__drift__drift_list` (no `scope`, or a path prefix to narrow). Each entry
   carries enough to choose with confidence:
   - `id` — the bin entry to resolve.
   - `description` — the stranded authored text you are about to recover.
   - `node_kind` (e.g. `user.description`), `user_authored` (true ⇒ hand-written, irreplaceable),
     `intent_source`, `path`, `deleted_at`.

4b. **Resolve.** Call `mcp__drift__drift_resolve` with the entry `id`:
   - `{ resolution: "reattach" }` restores the content onto its *original* anchor. It does **not**
     re-point onto the new symbol — re-pointing a missed description onto a different symbol is a tracked
     follow-up, not something reattach does today.
   - `{ resolution: "delete" }` keeps the entry removed.

### Confirm (both loops)

5. **Confirm.** Re-open the session (a resolved relocation no longer banners) or re-run `drift.list` (a
   resolved bin entry is gone), and open the flow in the webview to see the description back on its node.

## What to watch for

Note any friction: whether the banner / `drift.list` payload told you *which* entry to pick, whether
`reattach` vs `reanchor` was obvious for your case, and whether re-pointing a missed description onto a
*new* symbol was something you wanted (that is a tracked follow-up — reattach does not do it today).
