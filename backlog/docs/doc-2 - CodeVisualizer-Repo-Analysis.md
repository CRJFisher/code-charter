---
id: doc-2
title: CodeVisualizer Repo Analysis
type: other
created_date: "2026-03-26 11:28"
---

# CodeVisualizer Repo Analysis

Analysis of [DucPhamNgoc08/CodeVisualizer](https://github.com/DucPhamNgoc08/CodeVisualizer) — a VS Code extension (v1.0.6) that generates real-time, interactive control-flow flowcharts from source code using Tree-sitter and Mermaid.js.

## Core Pipeline

The tool follows a 4-stage pipeline:

```
Source Code → Tree-sitter AST → FlowchartIR → Mermaid Syntax → SVG (in webview)
```

| Stage                  | Technology                                                                               | Key Files                                           |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Parsing**            | `web-tree-sitter` (WASM) — 7 language grammars bundled as `.wasm` binaries               | `src/core/language-services/*/`                     |
| **IR Construction**    | Custom `FlowchartIR` with typed nodes (16 types), edges, and source location maps        | `src/ir/ir.ts`, `src/core/common/AbstractParser.ts` |
| **Mermaid Generation** | Converts IR to Mermaid `graph TD` syntax with theme-aware CSS classes and click handlers | `src/core/EnhancedMermaidGenerator.ts`              |
| **Rendering**          | Mermaid.js v11.8.0 (CDN) + svg-pan-zoom v3.6.1 in a VS Code webview                      | `src/view/BaseFlowchartProvider.ts`                 |

## Supported Languages

| Language                | Parser          | Flowcharts | Dependency Graph |
| ----------------------- | --------------- | ---------- | ---------------- |
| TypeScript / JavaScript | `TsAstParser`   | Yes        | Yes              |
| Python                  | `PyAstParser`   | Yes        | Yes              |
| Java                    | `JavaAstParser` | Yes        | No               |
| C                       | `CAstParser`    | Yes        | No               |
| C++                     | `CppAstParser`  | Yes        | No               |
| Rust                    | `RustAstParser` | Yes        | No               |
| Go                      | `GoAstParser`   | Yes        | No               |

Each parser extends an `AbstractParser` base class and handles language-specific constructs (e.g., Rust's `?` operator, Go's goroutines/select, Python's `match` and HOF patterns).

## Two Visualization Modes

### Function-Level Flowcharts (primary feature)

Generates **intra-function control-flow graphs** — not cross-function call graphs. Each function is analyzed independently.

- Tree-sitter AST is walked recursively, building a graph of typed nodes (entry, exit, decision, loop, return, exception, etc.) connected by control-flow edges
- Nodes are classified into 16 semantic types and 6 categories, each mapped to distinct shapes and theme colors
- **Bidirectional code-diagram navigation**: click a node to jump to source; move the cursor to highlight the corresponding node
- Auto-refreshes on code edits (debounced 500ms) and cursor movement to new functions

### Codebase Dependency Graphs (secondary feature)

Uses **regex-based import extraction** (not tree-sitter) — a completely separate pipeline from function flowcharts.

- Scans workspace files, extracts `import`/`require` statements, resolves paths
- Files are classified into 5 categories (core, report, config, tool, entry) with color coding
- Rendered as Mermaid `flowchart LR` with nested subgraphs mirroring directory hierarchy
- Dependency extraction only supports TypeScript/JavaScript and Python

## Intermediate Representation

The central data structure is `FlowchartIR` (defined in `src/ir/ir.ts`):

```typescript
interface FlowchartIR {
  nodes: FlowchartNode[]; // id, label, nodeType, shape, style, location, semanticInfo
  edges: FlowchartEdge[]; // from, to, optional label
  entryNodeId?: string;
  exitNodeId?: string;
  locationMap: LocationMapEntry[]; // maps nodeId → source byte offsets (start, end)
  functionRange?: { start: number; end: number };
  title?: string;
}
```

**NodeType** enum (16 values): `ENTRY`, `EXIT`, `PROCESS`, `DECISION`, `MERGE`, `LOOP_START`, `LOOP_END`, `EXCEPTION`, `BREAK_CONTINUE`, `FUNCTION_CALL`, `METHOD_CALL`, `MACRO_CALL`, `ASSIGNMENT`, `RETURN`, `ASYNC_OPERATION`, `AWAIT`, `PANIC`, `EARLY_RETURN_ERROR`, `SUBROUTINE`.

**NodeCategory** groups types into 6 buckets: `CONTROL_FLOW`, `DATA_OPERATION`, `FUNCTION_BOUNDARY`, `EXCEPTION_HANDLING`, `LOOP_CONTROL`, `ASYNC_CONTROL`.

Each node carries `SemanticNodeInfo` with heuristic metadata: complexity (low/medium/high), importance, and code type (synchronous/asynchronous/callback).

The `ProcessResult` type is the working accumulator during AST traversal — it tracks `exitPoints` and `nodesConnectedToExit` (for returns/breaks) to correctly wire up sequential and branching control flow.

## UI Architecture

**No frontend framework** — pure HTML/CSS/JS generated server-side and injected into VS Code webviews. The webview uses `acquireVsCodeApi()` for bidirectional communication with the extension host via `postMessage()`.

Three view surfaces:

| Surface              | Class                    | Type                                     |
| -------------------- | ------------------------ | ---------------------------------------- |
| **Sidebar**          | `FlowchartViewProvider`  | `WebviewViewProvider` (activity bar)     |
| **Detachable Panel** | `FlowchartPanelProvider` | `WebviewPanel` (singleton, positionable) |
| **Codebase Flow**    | `CodebaseFlowProvider`   | `WebviewPanel` (dependency graphs)       |

All inherit shared logic from `BaseFlowchartProvider` (~1550 lines), which handles HTML generation, event listeners, message routing, node highlighting, export, and LLM toggle.

### Webview ↔ Extension Host Messages

**Webview → Extension** (typed as `WebviewMessage` union): `highlightCode`, `export`, `exportError`, `openInPanel`, `copyMermaid`, `requestLLMLabels`, `disableLLMLabels`, `setupLLM`, `userInteractionStart`, `userInteractionEnd`.

**Extension → Webview**: `highlightNode`, `applyMermaid`, `llmAvailability`.

### Editor Compatibility

An `EnvironmentDetector` (`src/core/utils/EnvironmentDetector.ts`) detects VS Code, Cursor, Windsurf, and Trae at runtime. For non-VS Code editors, it engages a compatibility mode with more permissive CSP headers, initialization delays, and forced context retention.

## Interactive Features

- **Pan & zoom** via svg-pan-zoom (mouse wheel, drag, control icons)
- **Click-to-navigate**: each node carries source byte offsets; clicking jumps the editor to that code range
- **Cursor sync**: moving the editor cursor highlights the corresponding flowchart node
- **Hover effects**: hovered nodes glow orange, outgoing edges and target nodes are highlighted
- **Auto-refresh**: debounced 500ms on code edits; configurable via `codevisualizer.autoRefresh`
- **Export**: SVG and PNG (2x DPI) via toolbar buttons; copy raw Mermaid to clipboard
- **Code metrics overlay**: toggleable panel showing LOC, nodes, edges, decision points, returns, parameters
- **Multiple view modes**: sidebar, detachable panel (columns 2/3/beside), separate window

## AI/LLM Integration

The sole AI feature is **label paraphrasing** — rewriting code-like node labels (e.g., `if x > 0`) into natural language (e.g., "Check if x is positive"). The AI does not perform code analysis.

| Provider       | Endpoint                            | Default Model        |
| -------------- | ----------------------------------- | -------------------- |
| OpenAI         | `api.openai.com`                    | `gpt-4o-mini`        |
| Google Gemini  | `generativelanguage.googleapis.com` | `gemini-1.5-flash`   |
| Groq           | `api.groq.com`                      | `openai/gpt-oss-20b` |
| Ollama (local) | `localhost:11434`                   | `llama3.2`           |

Note: Anthropic is listed in the settings enum but **not implemented** in code.

Key design choices:

- All LLM calls use `fetch()` directly — no SDK dependencies
- Two-tier caching: in-memory `Map` + VS Code `globalState` with SHA-256 keys incorporating provider, model, style, and language
- **Incremental per-label caching** — only uncached labels hit the API on subsequent renders
- API keys stored via VS Code's encrypted Secret Storage
- Low temperature (0.1–0.2) for deterministic output
- Post-translation merging re-attaches click handlers and metadata comments stripped by the LLM

## Theming

9 built-in themes, each with light and dark variants: Monokai (default), Catppuccin, GitHub, Solarized, One Dark Pro, Dracula, Material Theme, Nord, Tokyo Night. Themes auto-adapt to VS Code's light/dark mode. 11 node semantic types get distinct colors per theme.

For codebase dependency graphs, files are auto-classified into 5 color-coded categories by `FileTypeClassifier`: Core (green), Report (magenta), Config (blue), Tool (orange), Entry (grey). Edges are also classified with distinct colors and styles (dashed for indirect/config dependencies).

## Build & Infrastructure

| Aspect            | Details                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| **Language**      | TypeScript (strict, ES2020 target, CommonJS modules)                                        |
| **Bundler**       | Webpack → single `dist/extension.js`                                                        |
| **Asset copying** | `copy-webpack-plugin` copies 8 `.wasm` files into `dist/`                                   |
| **Linting**       | ESLint with `@typescript-eslint` (flat config)                                              |
| **Testing**       | Mocha scaffolding via `@vscode/test-cli` + `@vscode/test-electron` — **zero tests written** |
| **CI/CD**         | **None** — publishing is manual via `vsce publish`                                          |
| **Runtime deps**  | Only 2: `web-tree-sitter` + `@vscode/tree-sitter-wasm`                                      |
| **Activation**    | `onStartupFinished` — always present after VS Code loads                                    |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  VS Code Extension Host (Node.js)                       │
│                                                         │
│  ┌──────────┐   ┌────────────┐   ┌───────────────────┐  │
│  │ analyzer │──▶│ AstParser  │──▶│  FlowchartIR      │  │
│  │ (router) │   │ (7 langs,  │   │  (nodes + edges   │  │
│  │          │   │ tree-sitter│   │   + location map)  │  │
│  └──────────┘   │ WASM)      │   └────────┬──────────┘  │
│                 └────────────┘            │              │
│                                           ▼              │
│                              ┌───────────────────────┐   │
│                              │ EnhancedMermaidGen    │   │
│                              │ (IR → Mermaid syntax  │   │
│                              │  + theme + click hdlr)│   │
│                              └───────────┬───────────┘   │
│                                          │               │
│  ┌─────────────┐  optional    ┌──────────▼──────────┐    │
│  │ LLMService  │◀────────────▶│  LLMManager         │    │
│  │ (4 providers│              │  (cache, translate)  │    │
│  │  via fetch) │              └──────────┬──────────┘    │
│  └─────────────┘                         │               │
│                                          ▼               │
│                              ┌───────────────────────┐   │
│                              │ BaseFlowchartProvider │   │
│                              │ (HTML gen, msg hdlr)  │   │
│                              └───────────┬───────────┘   │
└──────────────────────────────────────────┼───────────────┘
                    postMessage            │
┌──────────────────────────────────────────▼───────────────┐
│  VS Code Webview (Chromium)                              │
│                                                          │
│  Mermaid.js (CDN) → SVG → svg-pan-zoom (CDN)            │
│  Click/hover handlers → postMessage back to host         │
└──────────────────────────────────────────────────────────┘
```

## Notable Observations

1. **Not a call-graph tool** — it generates intra-function control-flow diagrams, one function at a time. Cross-function relationships are not tracked.
2. **Dual pipeline disconnect** — function flowcharts use tree-sitter (AST-based); dependency graphs use regex. Completely separate code paths with no shared analysis infrastructure.
3. **Zero tests, zero CI** — the Mocha infrastructure is scaffolded but empty. Publishing is manual.
4. **Anthropic gap** — listed in the settings enum as an LLM provider but no implementation exists in code.
5. **No framework overhead** — the entire webview UI is raw HTML strings with inline JS. No React/Vue/Svelte.
6. **Smart incremental caching** — per-label LLM caching with SHA-256 keys avoids redundant API calls when only part of a diagram changes.
7. **No persistent storage** — no database. LLM cache uses VS Code `globalState`; API keys use VS Code Secret Storage.
8. **No graph algorithms** — layout is fully delegated to Mermaid.js/Dagre. No cycle detection, topological sort, or community detection.
