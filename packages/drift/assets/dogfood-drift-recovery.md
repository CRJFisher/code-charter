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

## Three strandings, three recoveries

The surface distinguishes how badly a symbol moved:

- **Relocated** — you rename a function but leave its body unchanged. The description is *staged*, not
  binned: it stays live and `SessionStart` reports it as outstanding drift. Recover with
  `drift.resolve { kind: "node", id, resolution: "reanchor" }` — the description re-anchors onto the
  renamed symbol.
- **Miss, original symbol gone but you know the new one** — you rename *and* change the body, so the old
  anchor resolves nowhere. The description is *binned* (soft-deleted) and appears in `drift.list`, each
  entry carrying ranked `candidates[]` — plausible live symbols to re-home it on. Recover by re-pointing
  it onto a chosen target: `drift.resolve { kind: "node", id, resolution: "reattach", target }`, where
  `target` is a candidate's `symbol_path`. The hand-written description rides across onto the new symbol.
- **Miss, no better home** — the symbol is gone and the right new symbol is unknown (or there is none).
  Restore the description onto its *original* anchor with a bare `drift.resolve { kind: "node", id,
  resolution: "reattach" }`, or `"delete"` to keep it removed.

`kind` (`"node"` or `"edge"`) is required on every `drift.resolve` call — it says whether `id` is a node
id or an edge key, so the tool never has to guess.

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
   `{ kind: "node", id: "<id from banner>", resolution: "reanchor" }`. The description moves onto the
   renamed symbol.

### Loop B — recover a miss (`reattach` onto the original anchor, onto a new target, or `delete`)

3b. **Survey or step the bin.** Either call `mcp__drift__drift_list` (no `scope`, or a path prefix to
   narrow) to see the whole bin at once, or call `mcp__drift__drift_next` to pull just the next entry —
   the oldest stranding first — and walk the bin one at a time. Each entry carries enough to choose with
   confidence:
   - `id` — the bin entry to resolve.
   - `description` — the stranded authored text you are about to recover.
   - `node_kind` (e.g. `user.description`), `user_authored` (true ⇒ hand-written, irreplaceable),
     `intent_source`, `path`, `deleted_at`.
   - `candidates[]` — ranked plausible new targets, strongest first: each is a live `symbol_path` with a
     `reason` (`relocated` = the body moved there, `same-file`, or `name-match`) and a `score`.

4b. **Resolve.** Call `mcp__drift__drift_resolve` with `kind: "node"` and the entry `id`:
   - `{ resolution: "reattach", target: "<candidate symbol_path>" }` re-points the stranded description
     onto the chosen live symbol, carrying the hand-written text across. Pick `target` from the entry's
     `candidates[]` (usually `candidates[0]` when its `reason` is `relocated`).
   - `{ resolution: "reattach" }` (no `target`) restores onto the *original* anchor — for when the symbol
     is genuinely gone with no better home.
   - `{ resolution: "delete" }` keeps the entry removed.

   Then call `drift.next` again and repeat until it returns `null` — the bin is drained.

### Confirm (both loops)

5. **Confirm.** Re-open the session (a resolved relocation no longer banners) or re-run `drift.list` /
   `drift.next` (a resolved bin entry is gone), and open the flow in the webview to see the description
   back on its node — on the new target symbol when you reattached with one.

## What to watch for

Note any friction: whether the banner / `drift.list` payload told you *which* entry to pick, whether the
`candidates[]` ranking surfaced the right new target (and whether `drift.next`'s one-at-a-time stepping or
`drift.list`'s whole-bin survey felt more natural), and whether `reattach` (bare vs `target`) vs
`reanchor` was obvious for your case.
