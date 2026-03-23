---
id: TASK-19
title: Restructure UI package file layout for clarity and modularity
status: To Do
assignee: []
created_date: '2026-03-23 14:12'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The packages/ui/src/ directory has accumulated structural debt: junk-drawer _utils files, implementation-detail filenames (naming libraries not functionality), a 22+ file mega-directory, cross-cutting concerns trapped in chart-specific directories, dependency direction violations, and dead references. This restructuring should happen before the React Flow correctness fixes (tasks 16-18) to establish a clean foundation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->

### Eliminate junk-drawer files
- [ ] `performance_utils.ts` split: `LayoutCache` -> `layout_cache.ts`, `getVisibleNodes` absorbed into `virtual_renderer.tsx`, `useDebounce`/`useThrottle` moved to `src/hooks/`, `PerformanceMonitor` deleted (YAGNI — only does console.log)
- [ ] `navigation_utils.ts` renamed to `editor_navigation.ts` after extracting `isVSCodeContext`
- [ ] `symbol_utils.ts` renamed to `symbol_display.ts` or inlined into its single consumer

### Rename implementation-detail files to describe functionality
- [ ] `react_flow_data_transform.ts` -> `call_tree_to_graph.ts`
- [ ] `react_flow_types.ts` -> `chart_types.ts`
- [ ] `elk_layout.ts` -> `graph_layout.ts`
- [ ] `code_chart_area_react_flow.tsx` -> `code_chart_area.tsx`
- [ ] `use_flow_theme_styles.ts` -> `use_chart_theme_styles.ts`
- [ ] `config.ts` -> `chart_config.ts` (to distinguish from theme_config.ts)
- [ ] `zoom_aware_node.tsx` -> `chart_node_types.tsx` (it is the node type registry + ModuleGroupNode)
- [ ] `App.tsx`/`App.css` -> `app.tsx`/`app.css` (snake_case consistency)

### Fix dependency direction violation
- [ ] `isVSCodeContext()` extracted from `code_chart_area/` to `src/platform/vscode_detection.ts` so `theme/` no longer imports from a leaf component directory

### Extract cross-cutting concerns from code_chart_area/
- [ ] Generic error infrastructure (`ErrorLogger`, `withRetry`, `ErrorRecovery`, `ErrorNotificationManager`, `ErrorBoundary`, `ErrorNotifications`) moved to `src/error/`; only `LayoutError` and `handleReactFlowError` remain in chart directory
- [ ] `error_handling.ts` split: error types, retry/recovery logic, and notification management are separate files

### Clean up dead references and misplaced files
- [ ] Missing `flow_theme.css` import removed from `code_chart_area_react_flow.tsx`
- [ ] `test_react_flow.tsx` moved out of production code into a `__fixtures__/` subdirectory
- [ ] `test_mock_backend.ts` moved from `backends/` to colocated test infrastructure
- [ ] `App.css` deleted (CRA boilerplate, unused)
- [ ] Duplicate `symbol_display_name` function in `side_bar.tsx` replaced with import from shared location

### Narrow public API surface
- [ ] `src/index.tsx` uses explicit named exports instead of `export *` — only exports what library consumers need (`create_backend`, `BackendType`, `ThemeProviderComponent`, `useTheme`, etc.)

### Colocate test files (inline testing)
- [ ] All `__tests__/` directories eliminated — test files moved next to the source files they test (e.g. `graph_layout.ts` tested by `graph_layout.test.ts` in the same directory)
- [ ] Test fixtures moved to `__fixtures__/` subdirectories next to the tests that use them
- [ ] `performance.test.ts` renamed to match its source file (`layout_cache.test.ts`)
- [ ] `search_logic.test.ts` renamed to `search_panel_logic.test.ts` or search logic extracted to its own source file
- [ ] `theme_provider.test.tsx` renamed to `theme_context.test.tsx` to match source
- [ ] Jest config updated if needed to find `*.test.ts` files alongside source (not just in `__tests__/`)

### All tests still pass after restructuring
- [ ] All existing passing tests (101/117) continue to pass after file moves and renames
- [ ] All imports updated — no broken references

<!-- AC:END -->
