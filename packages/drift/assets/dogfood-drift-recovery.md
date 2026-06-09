# Dogfooding the drift recovery loop

A copy-paste walkthrough for driving the `drift.resolve` MCP surface against a real relocation in a
live Claude Code session. It exercises the path a user follows after a code rename re-syncs a flow's
diagram: the `SessionStart` banner reports the staged re-anchor, and `drift.resolve {reanchor}`
commits it onto the renamed symbol.

## Prerequisites

- A project with the drift MCP server and the `Stop`/`SessionStart` hooks installed (run the drift
  installer; the store lives at `.code-charter/graph.db`).
- At least one flow already hydrated for the code you are about to change (let the `Stop`-hook
  auto-sync persist it).

## Recovering a relocation

When you rename a function but leave its body unchanged, the re-sync recognises the move (the body's
content hash is unchanged) and stages a re-anchor: the diagram content stays live, and `SessionStart`
reports it as outstanding drift. `drift.resolve {reanchor}` commits the move onto the renamed symbol.

## Walkthrough

1. **Stage a relocation.** Pick a function in a hydrated flow and rename it, leaving the body
   unchanged (e.g. `compute` → `calculate`, body still `a + b`). End the turn so the `Stop`-hook
   auto-sync re-extracts the file.

2. **Open a new session and read the banner.** The `SessionStart` banner reports outstanding drift,
   printing `from → to (relocated; node <id>)` for each staged re-anchor — note that `<id>`, it is the
   argument to `reanchor`.

3. **Reanchor from the banner id.** Call `mcp__drift__drift_resolve` with the node `id` from the
   banner: `{ kind: "node", id: "<id from banner>", resolution: "reanchor" }`. `kind` (`"node"` or
   `"edge"`) is required — it says whether `id` is a node id or an edge key, so the tool never has to
   guess; outstanding drift is a node-only surface, so use `"node"`. The diagram content moves onto the
   renamed symbol.

4. **Confirm.** Re-open the session — a committed re-anchor no longer banners — and open the flow in
   the webview to see the content on the renamed symbol.

## What to watch for

Note any friction: whether the banner told you which node to reanchor, and whether the
`from → to` line made the move obvious for your case.
