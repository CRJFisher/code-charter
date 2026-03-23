---
id: TASK-19
title: Restructure UI package file layout for clarity and modularity
status: Done
assignee:
  - '@claude'
created_date: '2026-03-23 14:12'
updated_date: '2026-03-23 14:51'
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
- [x] #1 `performance_utils.ts` split: `LayoutCache` -> `layout_cache.ts`, `getVisibleNodes` absorbed into `virtual_renderer.tsx`, `useDebounce`/`useThrottle` moved to `src/hooks/`, `PerformanceMonitor` deleted (YAGNI — only does console.log)
- [x] #2 `navigation_utils.ts` renamed to `editor_navigation.ts` after extracting `isVSCodeContext`
- [x] #3 `symbol_utils.ts` renamed to `symbol_display.ts` or inlined into its single consumer

### Rename implementation-detail files to describe functionality
- [x] #4 `react_flow_data_transform.ts` -> `call_tree_to_graph.ts`
- [x] #5 `react_flow_types.ts` -> `chart_types.ts`
- [x] #6 `elk_layout.ts` -> `graph_layout.ts`
- [x] #7 `code_chart_area_react_flow.tsx` -> `code_chart_area.tsx`
- [x] #8 `use_flow_theme_styles.ts` -> `use_chart_theme_styles.ts`
- [x] #9 `config.ts` -> `chart_config.ts` (to distinguish from theme_config.ts)
- [x] #10 `zoom_aware_node.tsx` -> `chart_node_types.tsx` (it is the node type registry + ModuleGroupNode)
- [x] #11 `App.tsx`/`App.css` -> `app.tsx`/`app.css` (snake_case consistency)

### Fix dependency direction violation
- [x] #12 `isVSCodeContext()` extracted from `code_chart_area/` to `src/platform/vscode_detection.ts` so `theme/` no longer imports from a leaf component directory

### Extract cross-cutting concerns from code_chart_area/
- [x] #13 Generic error infrastructure (`ErrorLogger`, `withRetry`, `ErrorRecovery`, `ErrorNotificationManager`, `ErrorBoundary`, `ErrorNotifications`) moved to `src/error/`; only `LayoutError` and `handleReactFlowError` remain in chart directory
- [x] #14 `error_handling.ts` split: error types, retry/recovery logic, and notification management are separate files

### Clean up dead references and misplaced files
- [x] #15 Missing `flow_theme.css` import removed from `code_chart_area_react_flow.tsx`
- [x] #16 `test_react_flow.tsx` moved out of production code into a `__fixtures__/` subdirectory
- [x] #17 `test_mock_backend.ts` moved from `backends/` to colocated test infrastructure
- [x] #18 `App.css` deleted (CRA boilerplate, unused)
- [x] #19 Duplicate `symbol_display_name` function in `side_bar.tsx` replaced with import from shared location

### Narrow public API surface
- [x] #20 `src/index.tsx` uses explicit named exports instead of `export *` — only exports what library consumers need (`create_backend`, `BackendType`, `ThemeProviderComponent`, `useTheme`, etc.)

### Colocate test files (inline testing)
- [x] #21 All `__tests__/` directories eliminated — test files moved next to the source files they test (e.g. `graph_layout.ts` tested by `graph_layout.test.ts` in the same directory)
- [x] #22 Test fixtures moved to `__fixtures__/` subdirectories next to the tests that use them
- [x] #23 `performance.test.ts` renamed to match its source file (`layout_cache.test.ts`)
- [x] #24 `search_logic.test.ts` renamed to `search_panel_logic.test.ts` or search logic extracted to its own source file
- [x] #25 `theme_provider.test.tsx` renamed to `theme_context.test.tsx` to match source
- [x] #26 Jest config updated if needed to find `*.test.ts` files alongside source (not just in `__tests__/`)

### All tests still pass after restructuring
- [x] #27 All existing passing tests (101/117) continue to pass after file moves and renames
- [x] #28 All imports updated — no broken references
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Split `performance_utils.ts` into focused modules (layout_cache.ts, hooks, virtual_renderer absorption), delete PerformanceMonitor
2. Rename `navigation_utils.ts` to `editor_navigation.ts`, extract `isVSCodeContext` to `src/platform/vscode_detection.ts`
3. Rename `symbol_utils.ts` to `symbol_display.ts`
4. Batch rename all implementation-detail files to functionality-describing names
5. Extract generic error infrastructure to `src/error/` directory, split into separate files
6. Clean up dead references (flow_theme.css, App.css), move test fixtures, deduplicate symbol_display_name
7. Replace `export *` with explicit named exports in `src/index.tsx`
8. Colocate all test files next to their source, rename to match source files
9. Verify TypeScript compilation and test suite pass
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Complete restructuring of packages/ui/src/: split junk-drawer files, renamed 8 files to describe functionality, extracted error infrastructure to src/error/, fixed dependency direction violation, cleaned dead references, narrowed API surface, colocated all tests. 0 TypeScript errors, 119/137 tests passing (18 pre-existing failures, no regressions).
<!-- SECTION:NOTES:END -->
