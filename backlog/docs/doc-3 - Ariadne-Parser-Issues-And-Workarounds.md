---
id: doc-3
title: Ariadne Parser Issues And Workarounds
type: other
created_date: "2026-05-13 00:00"
---

# Ariadne Parser Issues And Workarounds

Tracks classes of indexing errors thrown / logged by `@ariadnejs/core` 0.8.0 (and its `tree-sitter` 0.21.x binding) that surface in the VS Code extension dev console when running on real-world repositories. None are fatal — the affected file is omitted from the call graph and indexing continues — but they create console noise and (more importantly) leave gaps in the graph.

The extension currently mitigates console noise via [AriadneProjectManager.with_quiet_ariadne_warnings](../../packages/vscode/src/ariadne/project_manager.ts), which scopes a `console.warn` filter to ariadne's known prefixes during `update_file`. That helper does not fix the underlying gaps in the graph.

## Reproduction Workspace

All examples observed indexing `paul-gauthier/aider` (`/Users/chuck/workspace/repo_analysis/aider` locally).

## Issue 1 — Tree-sitter `Invalid argument` on large Python files

**Symptom**

```
Error updating file .../aider/coders/base_coder.py: Error: Invalid argument
  at Parser.parse (.../tree-sitter/index.js:361:13)
  at Project.update_file (.../@ariadnejs/core/dist/project/project.js:152:29)
```

**Origin**

Thrown from the native `tree-sitter` binding inside `Project.update_file`'s `parser.parse(content)` call. The JS wrapper just propagates a native error string.

**Affected files in aider**

| File                         | Lines   | Bytes   |
| ---------------------------- | ------- | ------- |
| `aider/coders/base_coder.py` | 2,485   | 86,258  |
| `aider/commands.py`          | 1,694   | 61,613  |
| `aider/io.py`                | (large) | (large) |

`patch_coder.py` (706 lines, ~30 KB) parses fine, so this is not a strict file-size cutoff — but every observed failure is on a file >50 KB.

**Likely root cause**

Most likely tree-sitter's default `bufferSize` (32 KB chunks for the native parser). `Project.update_file` calls `parser.parse(content)` with no options, so the binding uses defaults. Files exceeding `bufferSize` can throw `Invalid argument` instead of being chunked correctly when the JS wrapper feeds the parser via the function-input path.

**Possible fixes (upstream)**

- `@ariadnejs/core` should pass `{ bufferSize }` larger than the file size, or measure `content.length` and choose a sufficient buffer.
- Or: catch the parse error inside `update_file` and fall back to a partial / empty parse result so the rest of indexing can continue cleanly.

**User-side workaround**

None practical short of excluding the file via the `file_filter` callback in [extension.ts:113](../../packages/vscode/src/extension.ts#L113).

## Issue 2 — Duplicate export for Python `class X(str, Enum)`

**Symptom**

```
Error updating file .../aider/coders/patch_coder.py: Error: Duplicate export name "ActionType"
  First:  class:.../patch_coder.py:17:7:17:16:ActionType
  Second: enum:.../patch_coder.py:17:7:17:16:ActionType
This indicates a bug in is_exported logic or malformed source code.
```

(The "indicates a bug in is_exported logic" line is emitted by ariadne itself — see `dist/resolve_references/registries/export.js:134`.)

**Origin**

The source at `patch_coder.py:17` is:

```python
class ActionType(str, Enum):
    ADD = "Add"
    DELETE = "Delete"
    ...
```

This is idiomatic Python for a string-valued enum. Ariadne's `index_single_file` step registers the same symbol under two definition kinds — once as `class:` (because of the `class` keyword) and once as `enum:` (because `Enum` is in the base list at the same location). The export registry then sees two entries for the same `export_name` and throws.

**Root cause**

Ariadne classifies Python class definitions as enums when an `Enum` base is detected, but does so as an _additional_ registration rather than replacing the class registration. The `is_exported` logic flags both, hits `export.js:134`, and bails on the whole file.

**Likely fix (upstream)**

In `index_single_file` for Python: when a class inherits from `Enum` (or `IntEnum`, `StrEnum`, `Flag`, etc.), emit a single definition with kind `enum` _instead of_ `class`, not in addition to it. The `class` registration should be suppressed for enum-deriving classes.

**Affected pattern**

Any Python file with `class Name(str, Enum):`, `class Name(Enum):`, `class Name(IntEnum):`, or similar. Common in real codebases for string-valued enum constants.

## Issue 3 — `Could not find body scope for ...`

**Symptom (logged at `console.warn`)**

```
Could not find body scope for anonymous function function:.../website/_includes/recording.js:1:47:428:1:<anonymous>
Could not find body scope for method <name>: <error>
Could not find body scope for constructor <name>: <error>
Could not find body scope for function <name>: <error>
```

**Origin**

`@ariadnejs/core/dist/index_single_file/definitions/definitions.js`, lines 117 / 148 / 198 / 240. Ariadne enumerates definitions (functions/methods/constructors/anonymous), then asks the language-specific scope extractor to bound each definition's body — if the extractor can't locate the body node, ariadne logs the warning and skips populating `enclosed_calls` for that definition.

**Observed trigger**

`recording.js:1` is an asciinema player IIFE wrapped as `(function(){…})()` spanning the entire file body (lines 1–428). The JavaScript scope extractor expects a function declaration / arrow that maps directly to a body scope node; the IIFE wrapper pattern produces an anonymous function expression at column 47 with the body 381 lines below, and the boundary extractor fails to align them.

**User impact**

The file is _not_ dropped from the index — definitions are still recorded — but their `enclosed_calls` lists are empty, so any calls those functions make are invisible to the call graph. This is silently lossy.

**Likely fix (upstream)**

The JS scope extractor needs to handle anonymous function expressions inside `(...)(...)` IIFE wrappers (and likely `;(function(){})()` and `!function(){}()` variants). The tree-sitter-javascript grammar gives the body node correctly; the extractor's traversal heuristic is the gap.

## Issue 4 — `Could not find colon in class definition at line N` (Python)

**Symptom (logged at `console.warn`)**

```
Could not find colon in class definition at line N
```

**Origin**

`@ariadnejs/core/dist/index_single_file/scopes/extractors/python_scope_boundary_extractor.js:159`. The Python scope extractor walks from the `class Name(...)` header and expects a `:` token to mark the start of the class body. When the bases list spans multiple lines:

```python
class Foo(
    BaseA,
    BaseB,
):
    ...
```

the heuristic that searches for the colon misses it because it's not on the same logical row as the class name.

**User impact**

Class methods inside the affected class are not bounded to the class scope correctly, leading to incomplete or missing class-level call relationships.

**Likely fix (upstream)**

Use the tree-sitter Python grammar's `block` child node of the `class_definition` node directly, rather than scanning forward for a `:` token from the name's row.

## Issue 5 — `Circular inheritance detected`

**Symptom (logged at `console.warn`)**

```
Circular inheritance detected: <class_id> → <parent_id>
```

**Origin**

`@ariadnejs/core/dist/resolve_references/registries/type.js:309`. While building the type-inheritance graph, ariadne detected a cycle and breaks out.

**Possible causes**

- A real cycle in source (rare; usually a typo).
- Cross-file name resolution incorrectly mapping a parent name back to a descendant — the more likely cause when this fires on a codebase that compiles/runs fine elsewhere.

**Status**

Not seen in the current aider session, but documented here because the workaround filter suppresses it. Re-evaluate if it shows up.

## Workaround Inventory In This Repo

| Workaround                                   | Location                                                                                                                             | What it does                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-file `console.error` removed during init | [project_manager.ts](../../packages/vscode/src/ariadne/project_manager.ts) — `initialize`                                            | Counts indexed / skipped files, logs a single summary line instead of one error per failed file.                                                                             |
| Extension allow-list                         | [project_manager.ts](../../packages/vscode/src/ariadne/project_manager.ts) — `SUPPORTED_EXTENSIONS`                                  | Pre-filters to `.ts/.tsx/.js/.jsx/.py/.rs` so non-source files (`.json`, `.yaml`, `CNAME`, etc.) never reach `detect_language` and don't throw `Unsupported file extension`. |
| Scoped `console.warn` filter                 | [project_manager.ts](../../packages/vscode/src/ariadne/project_manager.ts) — `with_quiet_ariadne_warnings` + `ARIADNE_WARN_PREFIXES` | Hides ariadne's Issue 3 / 4 / 5 warnings while inside `update_file`. Other `console.warn` calls pass through unchanged.                                                      |

## Tracking Upstream

These issues belong in the `@ariadnejs/core` repository, not Code Charter. Before filing:

- Confirm the repro on a fresh ariadne checkout (avoid noise from our wrappers).
- Issue 2 (Python Enum duplicate export) and Issue 4 (multi-line class header) are the most actionable and have clear fixes.
- Issue 1 (tree-sitter `Invalid argument`) needs ariadne to confirm whether the gap is in `Project.update_file` (no `bufferSize`) or deeper in tree-sitter itself.
- Issue 3 (anonymous IIFE body scope) is a known limitation pattern that probably already has a tracking issue — search the repo first.
