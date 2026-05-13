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
| **Parsing**            | `web-tree-sitter` (WASM) — 8 language grammars bundled as `.wasm` binaries               | `src/core/language-services/*/`                     |
| **IR Construction**    | Custom `FlowchartIR` with typed nodes (19 types), edges, and source location maps        | `src/ir/ir.ts`, `src/core/common/AbstractParser.ts` |
| **Mermaid Generation** | Converts IR to Mermaid `graph TD` syntax with theme-aware CSS classes and click handlers | `src/core/EnhancedMermaidGenerator.ts`              |
| **Rendering**          | Mermaid.js v11.8.0 (CDN) + svg-pan-zoom v3.6.1 in a VS Code webview                      | `src/view/BaseFlowchartProvider.ts`                 |

## Supported Languages

| Language                | Parser          | Flowcharts | Dependency Graph |
| ----------------------- | --------------- | ---------- | ---------------- |
| TypeScript / JavaScript | `TsAstParser`   | Yes        | Yes              |
| Python                  | `PyAstParser`   | Yes        | Yes (degenerate) |
| PHP                     | `PhpAstParser`  | Yes        | Yes              |
| Java                    | `JavaAstParser` | Yes        | No               |
| C                       | `CAstParser`    | Yes        | No               |
| C++                     | `CppAstParser`  | Yes        | No               |
| Rust                    | `RustAstParser` | Yes        | No               |
| Go                      | `GoAstParser`   | Yes        | No               |

Each parser extends an `AbstractParser` base class and handles language-specific constructs (e.g., Rust's `?` operator, Go's goroutines/select, Python's `match` and HOF patterns). The Python dependency-graph regex collapses `from a.b.c import x` to `a` and drops bare package imports (`import pandas`) — almost every real Python import is silently discarded.

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

**NodeType** enum (19 values): `ENTRY`, `EXIT`, `PROCESS`, `DECISION`, `MERGE`, `LOOP_START`, `LOOP_END`, `EXCEPTION`, `BREAK_CONTINUE`, `FUNCTION_CALL`, `METHOD_CALL`, `MACRO_CALL`, `ASSIGNMENT`, `RETURN`, `ASYNC_OPERATION`, `AWAIT`, `PANIC`, `EARLY_RETURN_ERROR`, `SUBROUTINE`.

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

The settings enum (`package.json`) lists 9 themes, but `ThemeManager` only actually registers 8 (Catppuccin is enum-only and falls back to Monokai). Each has light and dark variants: Monokai (default), [Catppuccin — unimplemented], GitHub, Solarized, One Dark Pro, Dracula, Material Theme, Nord, Tokyo Night. Themes auto-adapt to VS Code's light/dark mode. 11 node semantic types get distinct colors per theme.

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

## Key Functional Distinctions vs Ariadne + Code-charter

The two stacks occupy different layers of code understanding. CodeVisualizer answers "what is the control flow inside this one function?"; ariadne+code-charter answers "what functions call which, across the whole project, and how do they cluster semantically?"

### Capability Matrix

| Capability                                      | CodeVisualizer                                    | Ariadne + Code-charter                                          |
| ----------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| **Granularity**                                 | Per-function, intra-procedural CFG                | Whole-project, inter-procedural call graph                      |
| **Languages**                                   | TS/JS, Py, Java, C, C++, Rust, Go, PHP (8)        | TS/JS, Python, Rust (3 — narrower)                              |
| **Symbol model**                                | None — function names are bare strings            | `DefinitionRegistry` indexed by stable `SymbolId`               |
| **Reference resolution**                        | None — call sites are labeled raw text            | `ReferenceRegistry` + `ResolutionRegistry` via scope graphs     |
| **Cross-file linking**                          | None for code; regex import-graph for files only  | `ImportGraph`, polymorphic `CallReference.resolutions[]`        |
| **Cross-function edges**                        | Cannot represent                                  | First-class — `CallableNode.enclosed_calls`                     |
| **Intra-function branching/loops**              | First-class — 19 node types, entry/exit/loop/etc. | Cannot represent                                                |
| **File-import dependency graph**                | Yes — regex-extracted, nested subgraphs by dir    | Not exposed — only function-level edges                         |
| **Semantic clustering**                         | None                                              | Spectral/kmeans/agglomerative on embeddings + adjacency         |
| **Embeddings**                                  | None                                              | Local Hugging Face `Xenova/all-MiniLM-L6-v2` (in-process)       |
| **LLM use**                                     | Label paraphrasing only (cosmetic)                | None — heuristic TF-IDF cluster naming, regex docstring extract |
| **LLM providers**                               | OpenAI, Gemini, Groq, Ollama (Anthropic orphaned) | N/A                                                             |
| **Bidirectional code↔diagram nav**              | Yes — byte-offset, cursor-follows-flow            | One-way only (click node → open file at line)                   |
| **Auto-refresh on edit**                        | Yes — 500ms debounce per keystroke                | File watcher rebuilds graph; diagram needs explicit re-run      |
| **Pan/zoom**                                    | svg-pan-zoom over Mermaid SVG                     | React Flow built-in (with minimap, virtualization)              |
| **Minimap / search / virtualization**           | No                                                | Yes                                                             |
| **Image export (SVG/PNG)**                      | Yes — 2× DPI PNG, copy raw Mermaid                | No — only JSON state export                                     |
| **Themes**                                      | 8 hand-tuned palettes × light/dark                | 2 themes; inherits VS Code CSS vars instead                     |
| **Editor-fork support (Cursor/Windsurf/Trae)**  | Yes — `EnvironmentDetector`, relaxed CSP          | VS Code only                                                    |
| **View surfaces**                               | Sidebar + detachable panel + codebase panel       | Single panel                                                    |
| **Persistence**                                 | `globalState` (LLM cache) + Secret Storage (keys) | Git-committed `cluster-summaries.json` + gitignored embeddings  |
| **Re-analysis model**                           | Stateless re-run on every edit                    | Persistent project model with content-hash invalidation         |
| **Backend abstraction**                         | None — VS Code APIs called directly               | `CodeCharterBackend` interface (VSCode/Mock) — runs in browser  |
| **UI framework**                                | None — template-literal HTML strings              | React 18 + `@xyflow/react` + `elkjs`                            |
| **Tests**                                       | Zero (Mocha scaffold empty)                       | ~22 Jest files across packages                                  |
| **Runtime deps**                                | 2 (`web-tree-sitter`, `@vscode/tree-sitter-wasm`) | Heavy: React, xyflow, elkjs, `clustering-tfjs`, transformers    |

### The Core Distinction

The IRs are orthogonal axes of the same problem. CodeVisualizer's `FlowchartNode` has no `target_symbol` or `callee_id` field — a call site is just a labeled rectangle. Ariadne's `CallableNode` has `enclosed_calls: CallReference[]` where each `resolutions[]` array points to callee `SymbolId`s — but no branches, loops, or merges inside the function body.

CodeVisualizer's "Codebase Dependency Graph" feature is **file-level only** — built from regex-matched `import`/`require`/`include` strings, not symbol resolution. It cannot tell you "function `foo` calls function `bar`"; only "file A imports file B." Even the `extractFunctions`/`extractExports` data it collects per file is **dead code** — neither `CodebaseGraphBuilder` nor `CodebaseMermaidGenerator` reads it.

### Could CodeVisualizer Be Extended To Call Graphs?

Not without a foundational rewrite. It would need to add (a) a definition extractor per language with stable IDs, (b) a scope graph and name-resolution stage, (c) a separate symbol-level IR alongside `FlowchartIR`, (d) polymorphism/dispatch handling, and (e) import resolution. That is essentially Ariadne. The tree-sitter WASM foundation could be reused, but the analysis layer above it would be net new. This is exactly why code-charter's `packages/vscode/src/code_parsing/` directory is now empty — it delegates the entire job to Ariadne.

### Conversely: What Code-charter Lacks That CV Has

- **Per-function control flow.** Code-charter can show that `foo` calls `bar`, but not the `if/else/loop/try` structure inside `foo`. The 19-type IR (decision, merge, loop_start, loop_end, exception, panic, etc.) has no analog.
- **Cursor-follows-flow.** Moving the editor cursor into a different statement highlights the corresponding flowchart node via a byte-offset `locationMap`. Code-charter has no `onDidChangeTextEditorSelection` listener — navigation is one-way (click node → open file).
- **Live debounced refresh.** Code-charter rebuilds the call graph on file change but doesn't re-render the diagram automatically; the user must re-trigger clustering.
- **Image export.** Code-charter exports only JSON state, no SVG/PNG.
- **Editor-fork compatibility.** Code-charter has no `EnvironmentDetector` equivalent — single-target VS Code.
- **Code metrics overlay.** LOC, decision points, return statements, parameters — none in code-charter.
- **Language breadth.** 8 vs 3.

### Strategic Positioning

The two products are complementary, not competitive:

- **CodeVisualizer** is a real-time, function-scoped, single-developer "show me the shape of this function" tool. Strengths: language breadth, polish, editor-fork support, multiple view surfaces, image export, cursor-precise bidirectional nav. Weaknesses: cannot reason about a codebase as a whole; no semantic understanding beyond control-flow shape; LLM use is cosmetic.

- **Code-charter + Ariadne** is a project-scale code-comprehension tool: build a real call graph, cluster it semantically, summarize clusters, navigate by feature rather than by file. Strengths: actual cross-function understanding, embeddings-driven clustering, persistent analyzed project model, abstracted backend (runs in browser). Weaknesses: no intra-function detail, fewer languages, no image export, VS Code only, no editor-fork support.

The natural bridge would be CodeVisualizer's `FUNCTION_CALL` nodes serving as drill-down targets in code-charter's call-graph view: code-charter shows the call graph; click a function, get CodeVisualizer's intra-function flowchart for the body. That requires CodeVisualizer to accept a function definition handed to it (rather than re-deriving from cursor position) — a small API change, since the analyzer already takes `(sourceCode, position)`.

### Notable Anti-Patterns Observed in CodeVisualizer

- **Anthropic in the provider enum but unimplemented** — selecting it falls through unhandled (`package.json:264` lists it; `Provider` union, `getDefaultModels`, `callProvider` all omit it).
- **`CodebaseAnalyzer` extracts `functions[]` and `exports[]` per file but nothing reads them** — dead data carried through the pipeline.
- **`FileTypeClassifier` vocabulary is hard-coded to one specific codebase** — substring matches on `gosubsum`, `match-facade`, `acorn`, `tsc`. Not generic.
- **Hover highlight does multi-pattern DOM ID matching** (`L_X_Y_`, `X_Y`, `X-Y`, `edge_X_Y`) to defend against Mermaid's varying generated IDs — brittle.
- **CDN-loaded Mermaid + svg-pan-zoom** — `script-src https://cdn.jsdelivr.net` plus `securityLevel: 'loose'`. Offline failure mode; CSP exposure.
- **Catppuccin theme exposed in settings but missing from registry** — silent fallback to Monokai.
- **Java, C, C++, Rust, Go scanned in the dependency graph but their imports are never extracted** — appear as orphan nodes.

### Notable Strengths in Code-charter Worth Borrowing

- **Per-file SemanticIndex caching with git-tree-hash manifest** in Ariadne — cache granularity matches change granularity.
- **`CodeCharterBackend` abstraction with `VSCodeBackend` and `MockBackend`** — same React app runs in VS Code or standalone browser.
- **Hierarchical ELK compound layout** with module clustering for whole-codebase scale.
- **Virtualization, layout cache, search panel, ARIA labels, keyboard navigation** — production-grade UI engineering.
- **Local Hugging Face embeddings** — no API keys, no network, no cost; deterministic clustering.
