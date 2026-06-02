# Code Charter VSCode Extension

Code Charter helps you get oriented in a codebase fast. It surfaces **flows** — functionality umbrellas over one or more call-graph trees — one at a time in a left-panel selector, and renders the selected flow as its own connected diagram.

## Features

- **Flow selector**: the left panel lists the project's flows. Flows whose code has been worked on (and so have an agentic diagram) appear first by recency; the deterministic skeleton flows for the rest of the tree follow. The top flow is auto-selected on open, so a cold repo shows structure without a click.
- **Per-flow diagram**: selecting a flow renders its reachable call-graph subgraph, folded by a file-module scaffold and bounded to a per-view budget so large flows stay legible.
- **Whole-tree coverage**: every top-level entrypoint yields a flow, and code reachable from no entrypoint is collected into a single browsable `Unattributed` flow.

The diagrams are deterministic and built from the Ariadne call graph — no API keys, no model downloads, no network access.

## Requirements

- VSCode 1.87.0 or higher.

## Extension Settings

- `code-charter-vscode.devMode`: load the UI from a development server instead of the bundled build.
- `code-charter-vscode.devServerUrl`: the UI development server URL (default `http://localhost:3000`).

## Usage

1. Open a project in VSCode.
2. Run the command **Code Charter: Visualize Code Trees**.
3. Pick a flow from the left panel — the top one is already selected and rendered.
4. Click a node to jump to its source.

## Known Issues

- Large codebases take time to build the initial call graph.
