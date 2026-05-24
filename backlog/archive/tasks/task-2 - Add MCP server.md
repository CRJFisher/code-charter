# task-2 - Add MCP server

## Description (the why)

Introduce a server that implements the **MCP – Model Context Protocol** so that autonomous agents and human contributors can request on-demand *machine-readable* and *human-friendly* visualisations of the codebase.  MCP defines a small HTTP+JSON protocol that exposes a software system’s **model** (classes, functions, modules, etc.) together with additional **context** (relations, metadata, diffs) so that tools can reason about it.

For this project, the MCP server must, at minimum, implement the subset of the specification that covers `/model` and `/graph` resources.  Building on those machine-readable responses, the server must also expose convenience endpoints that return ready-made SVG diagrams, keeping the UX described in the original idea.

1. Provide a **machine-readable model** of the repository via the MCP `/model` endpoint.
2. Provide a **machine-readable call/coupling graph** (current and diff) via the MCP `/graph` endpoint.
3. Provide **human-friendly SVG diagrams** derived from the same data for quick visual inspection.

Supporting MCP makes the project interoperable with other agent tooling and future dashboards while still delivering the interactive diagrams that improve developer experience.

## Acceptance Criteria (the what)

- [ ] An MCP server can be started locally via a single command (e.g. `make mcp-serve` or `poetry run mcp serve`).
- [ ] The server responds to `GET /model` with a JSON document that conforms to the MCP Model schema and represents the current repository structure.
- [ ] The server responds to `GET /graph` with a JSON call/coupling graph; the optional query param `diff=<git-ref>` returns a diff graph between HEAD and the specified ref, as defined by MCP.
- [ ] The server exposes `GET /viz/code-tree` and `GET /viz/call-graph` (with optional `diff=<git-ref>`) that return an SVG diagram derived from `/model` and `/graph` respectively.
- [ ] Diagrams are delivered in an easily embeddable SVG (preferred) or high-resolution PNG format.
- [ ] A Backlog.md CLI wrapper (or similar) is provided so agents can invoke `backlog viz code-tree` and `backlog viz call-graph --diff <ref>` without remembering raw URLs; the wrapper should fallback to `/model` & `/graph` when SVG endpoints are disabled.
- [ ] Documentation is added in `backlog/docs/` describing how to start the MCP server, the subset of MCP implemented, and example usage (both JSON and SVG flows).
- [ ] Unit / integration tests cover at least the `/model`, `/graph`, and visualisation endpoints, verifying non-empty and schema-valid responses.

## Implementation Plan (the how)

1. Evaluate lightweight visualisation libraries (e.g. Graphviz via `graphviz`/`pydot`, or `diagrams`) for generating SVG output.
2. Build a small FastAPI (or Flask) application exposing `/code-tree` and `/call-graph` endpoints.
3. Implement a code-tree scanner that walks the repository and produces a node-edge representation suitable for Graphviz.
4. Leverage an existing static-analysis tool (e.g. `pyan`, `ast`, or `networkx`) to generate a call graph from the source code; support diffing against another Git ref using `git diff` + incremental analysis.
5. Containerise the server and add Make/Poetry scripts for local execution.
6. Add a thin CLI wrapper under `backlog/scripts/` that forwards to the HTTP endpoints and prints the location of the generated diagram (or opens it automatically when run interactively).
7. Write documentation and tests.
