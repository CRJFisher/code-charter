---
id: TASK-16
title: Fix React Flow layout and correctness bugs
status: Done
assignee: []
created_date: '2026-03-23 13:48'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The React Flow integration in the VSCode webview has critical correctness bugs discovered during an audit comparing code-charter's usage against the clauditor reference project. The flat ELK layout approach produces wrong node positions when parentId grouping is active, CodeFunctionNode's hardcoded colors break dark mode, the data-fetching useEffect has a race condition, and search input causes regex crashes. These must be fixed for the UI to render correctly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] ELK layout uses hierarchical children arrays (or 3-pass algorithm) so child nodes are positioned correctly relative to parent module groups
- [x] Module group dimensions are calculated after ELK layout (not before) so they accurately encompass child nodes
- [x] Data-fetching useEffect has cancellation (AbortController or cancelled flag) preventing stale data overwrites on rapid entry point changes
- [x] CodeFunctionNode uses useFlowThemeStyles() instead of hardcoded hex colors for all 8+ color values
- [x] Search input escapes regex metacharacters before constructing RegExp (no SyntaxError on special characters)
- [x] acquireVsCodeApi() is called once at module scope and cached (not on every navigation click)
- [x] Stale flow_theme.css import is removed from code_chart_area_react_flow.tsx
- [x] All changes verified working in both light and dark VS Code themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restructure ELK layout to use hierarchical children arrays for module compound nodes
2. Remove pre-layout module dimension calculation from call_tree_to_graph.ts — let ELK compute them
3. Add cancelled flag to data-fetching useEffect for race condition prevention
4. Replace all 8+ hardcoded hex colors in CodeFunctionNode with useFlowThemeStyles() hook
5. Add regex metacharacter escaping in search_panel.tsx highlightMatch function
6. Cache acquireVsCodeApi() at module scope in editor_navigation.ts
7. Update accessibility tests to wrap CodeFunctionNode renders in ThemeProviderComponent
8. Verify zero TypeScript errors and zero test regressions
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Six correctness bugs fixed across the React Flow integration:

**ELK layout hierarchy** (graph_layout.ts, call_tree_to_graph.ts): Replaced flat ELK node array with hierarchical structure. `build_elk_graph()` creates compound ELK nodes for modules containing their child function nodes, with edges classified as internal (within a module) or cross-module. `flatten_elk_nodes()` recursively collects positioned nodes from the ELK output. Module group dimensions now come from ELK (not pre-calculated from stale pre-layout positions).

**Race condition** (code_chart_area.tsx): Added `cancelled` flag with cleanup function to the data-fetching useEffect. Each async checkpoint checks the flag before updating state.

**Theme colors** (code_function_node.tsx): Replaced 8 hardcoded hex colors (#e8f5e9, #ffffff, #0096FF, #e0e0e0, #2e7d32, #333333, #666666, #555) with values from `useFlowThemeStyles()`. Updated accessibility tests to wrap renders in `ThemeProviderComponent`.

**Regex escape** (search_panel.tsx): Added `escape_regex()` function that escapes metacharacters before constructing RegExp in `highlightMatch()`.

**VS Code API caching** (editor_navigation.ts): `acquireVsCodeApi()` is now called once via `get_vscode_api()` lazy cache instead of on every navigation click.

**flow_theme.css removal**: Already handled by task-19.

Modified files: graph_layout.ts, call_tree_to_graph.ts, code_chart_area.tsx, code_function_node.tsx, search_panel.tsx, editor_navigation.ts, accessibility.test.tsx. 0 TypeScript errors, 121/137 tests passing (16 pre-existing failures, 0 regressions).
<!-- SECTION:NOTES:END -->
