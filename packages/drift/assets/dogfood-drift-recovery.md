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

1. **Strand a description.** In a file whose function carries a hand-written description, rename the
   function and change its body (e.g. `compute` returning `a + b` → `calculate` returning `a * b - 1`).
   End the turn so the `Stop`-hook auto-sync runs and re-extracts the file.

2. **Open a new session.** The `SessionStart` banner reports outstanding drift. A pure rename shows the
   relocation (`from → to`); a rename-and-rewrite leaves nothing staged — the description is in the bin.

3. **List the bin.** Call `mcp__drift__drift_list` (no `scope`, or a path prefix to narrow). Each entry
   carries enough to choose with confidence:
   - `id` — the bin entry to resolve.
   - `description` — the stranded authored text you are about to recover.
   - `node_kind` (e.g. `user.description`), `user_authored` (true ⇒ hand-written, irreplaceable),
     `intent_source`, `path`, `deleted_at`.

4. **Resolve.** Call `mcp__drift__drift_resolve` with the entry `id`:
   - `{ resolution: "reattach" }` restores the content. **Note:** reattach restores onto the *original*
     anchor; it does not re-point onto the new symbol. For a clean rename (relocated, still staged) use
     `{ resolution: "reanchor" }` instead, which moves the description onto the renamed symbol.
   - `{ resolution: "delete" }` keeps the entry removed.

5. **Confirm.** Re-run `drift.list` (the resolved entry is gone) and open the flow in the webview to see
   the description back on its node.

## What to watch for

Note any friction: whether `drift.list`'s payload told you *which* entry to pick, whether `reattach`
vs `reanchor` was obvious for your case, and whether re-pointing a missed description onto a *new* symbol
was something you wanted (that is a tracked follow-up — reattach does not do it today).
