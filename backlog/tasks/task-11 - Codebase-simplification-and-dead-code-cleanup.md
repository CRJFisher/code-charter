---
id: task-11
title: Codebase simplification and dead code cleanup
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies: []
---

## Description

Comprehensive review by 10 independent opus-level code reviewers identified widespread dead code, over-engineering, broken tests, and simplification opportunities across the entire codebase. This task tracks the cleanup and simplification work needed to reduce complexity, fix bugs, and remove dead code.

The reviewers covered: UI components, theme system, backend/provider pattern, VSCode extension core, clustering service, summarise module, shared types & code graph, code chart area, error handling & utils, and build config & monorepo structure.

## Acceptance Criteria

### Dead File Deletion
- [x] Delete `packages/vscode/src/clustering/clustering_service_old.ts` (dead, superseded by clustering_service.ts)
- [x] Delete `packages/ui/src/components/color_theme.ts` (78 lines, zero imports, reads CSS vars at module-load time incorrectly)
- [x] Delete `packages/vscode/src/run.ts` (exports runCommand/execAsync, never imported)
- [x] Delete `packages/vscode/src/webviewApi.ts` (empty file, zero bytes)
- [x] Delete `packages/vscode/src/git.ts` (exports getFileVersionHash, never imported)
- [x] Delete `packages/ui/src/components/code_chart_area/flow_theme_provider.tsx` (never mounted in JSX tree, useFlowTheme/useThemeColor would throw)
- [x] Delete `packages/ui/src/components/code_chart_area/flow_theme_switcher.tsx` (never imported, duplicates ThemeSwitcher)
- [x] Delete `packages/ui/src/backends/test_mock_backend.ts` (imports nonexistent `Backend` type, cannot compile)
- [x] Delete `packages/ui/src/components/code_chart_area/test_react_flow.tsx` (uses `children` property that doesn't exist on CallGraphNode)
- [x] Delete `packages/ui/src/components/code_chart_area/flow_theme.css` (references CSS vars only set by deleted FlowThemeProvider)

### Dead Export Removal
- [x] Remove `readCallGraphJsonFile` from `packages/vscode/src/summarise/summarise.ts` (exported but never imported)
- [x] Remove `getBottomLevelFolder` from `packages/vscode/src/files.ts` (exported, never imported, has `// TODO: broken` comment)
- [x] Remove `countNodes` from `packages/vscode/shared/codeGraph.ts` (exported, never imported)
- [x] Remove `nodeTypes` from `packages/ui/src/components/code_chart_area/code_function_node.tsx` (superseded by zoomAwareNodeTypes)
- [x] Remove `BatchUpdater` from `packages/ui/src/components/code_chart_area/performance_utils.ts` (only used in tests)
- [x] Remove `useProgressiveLoading` from `packages/ui/src/components/code_chart_area/virtual_renderer.tsx` (exported, never used)
- [x] Remove `DataProcessingError` and `TimeoutError` from error_handling.ts (never instantiated anywhere)
- [x] Remove `useErrorHandler` from error_boundary.tsx (exported, never imported)
- [x] Remove `ProgressBar` export from loading_indicator.tsx (never imported)
- [x] Remove `getNodeLOD`/`NodeLOD` from virtual_renderer.tsx (never imported outside tests)
- [x] Remove `useThemeColors` hook from theme_context.tsx (never called by consumer code)
- [x] Remove `ThemeSelector` from theme_switcher.tsx if no planned use case
- [x] Remove `is_model_cached()` and `get_model_size()` from local_embeddings_provider.ts (never called)
- [x] Remove unused `Def` import from codeGraph.ts

### Bug Fixes (Critical)
- [x] Fix `for...in` on `Object.keys()` at `summariseClusters.ts:68` - change to `for...of` (currently works by coincidence with numeric IDs)
- [x] Fix `getModelDetails()` in extension.ts - add else branch that throws for unrecognized providers (currently returns undefined)
- [x] Fix layout cache key in `elk_layout.ts:52` - uses `layout-${nodes.length}-${edges.length}` instead of content-based hash (serves wrong cached layouts for structurally different graphs with same counts)
- [x] Fix symbol separator inconsistency: vscode/shared/symbols.ts splits on `#`, ui/symbol_utils.ts splits on `::`, side_bar.tsx splits on `:` - unify across packages
- [x] Fix duplicate error notifications: code_chart_area_react_flow.tsx fires both `handleReactFlowError(error)` AND `notify(...)` for same error, creating two notifications
- [x] Fix stale business logic cache key in summarise.ts:227 - hashes only `node.symbol` but should include upstream processing-steps summary
- [x] Fix `validate_provider_config` in embedding_provider_selector.ts - always returns true even on failure, making validation check dead logic
- [x] Fix syntax error in search_panel.tsx:179 (TypeScript compilation fails)
- [ ] Fix wasted position computation in react_flow_data_transform.ts - recursive position calculation immediately overwritten by ELK layout
- [ ] Fix module group bounding boxes calculated from pre-layout positions (should run after ELK layout)
- [x] Fix viewport store selector in code_chart_area_react_flow.tsx:98-102 creating new object every render (defeats reference equality)
- [x] Fix Array.sort() called without memoization in side_bar.tsx:103-105 (mutates original array on every render)
- [x] Fix stale closure in perfMonitor (code_chart_area_react_flow.tsx:192) capturing previous render's node/edge counts

### Dependency Cleanup
- [x] Remove `@tensorflow/tfjs-node` from vscode/package.json (~200MB native module, never imported)
- [x] Remove `@xenova/transformers` from vscode/package.json (superseded by `@huggingface/transformers`)
- [x] Remove `@langchain/anthropic` from vscode/package.json (never imported)
- [x] Remove `@langchain/google-vertexai` from vscode/package.json (never imported)
- [x] Remove `@vscode/python-extension` from vscode/package.json (never imported)
- [x] Remove `pouchdb-upsert` from vscode/package.json (never imported)
- [x] Remove `react-icons` from ui/package.json (never imported)
- [x] Remove redundant babel dependencies (babel/core, babel/preset-env, babel/preset-typescript, babel-jest) - conflicting with ts-jest

### Test Infrastructure
- [x] Fix Jest config to exclude `out/` directory (tests run twice: .ts source and compiled .js)
- [x] Fix or rewrite theme_provider.test.tsx (imports nonexistent `../theme_provider`, tests methods that don't exist)
- [x] Fix mock_backend.test.ts (8 failures - tests old `Backend` interface, not current `CodeCharterBackend`)
- [x] Fix accessibility.test.tsx (4 failures - ZoomAwareNode needs ThemeProvider wrapper in tests)
- [x] Fix error_handling.test.tsx (9 failures - ErrorNotifications needs ThemeProvider wrapper)
- [x] Fix vscode_backend.test.ts (crashes Jest worker - calls navigateToDoc without connect())
- [x] Fix integration tests importing from nonexistent `contexts/backend_context`
- [ ] Remove stale compiled test files from out/ (e.g., refscope-integration.test.js)
- [x] Remove vestigial test in domainContext.test.ts ("given a name produces the expected greeting" tests nothing)

### Code Simplification
- [x] Remove `console.log(modelDetails)` debug statement from summarise.ts:27
- [x] Remove `console.log('Node selected:', nodeId)` from code_chart_area_react_flow.tsx:384
- [x] Replace `alert()` calls with proper UI notifications (code_chart_area_react_flow.tsx:465,503 and keyboard_navigation.tsx:110-124)
- [ ] Make code_function_node.tsx theme-aware (hardcoded colors: #ffffff, #e8f5e9, #333333, #666666, #555)
- [ ] Make search_panel.tsx theme-aware (hardcoded colors: white, #ddd, #666, #f5f5f5)
- [x] Remove `COLOR_CONFIG` from config.ts (superseded by theme system), update 3 remaining call sites
- [x] Consolidate duplicate symbolRepoLocalName/symbolDisplayName in vscode/shared/symbols.ts (identical implementations)
- [x] Remove unused `import * as path` from clustering_service.ts
- [x] Remove unused `funcToIndex` parameter from `orderClustersByCentroid` in clustering_service.ts:329
- [x] Remove `CodeCharterUI` component (computes backend_config but never uses it, just renders `<App />`)
- [x] Remove `// ... rest of the methods remain the same as original ...` stale comment from clustering_service.ts:218
- [x] Fix typo `cluserSequence` -> `clusterSequence` in summariseClusters.ts:39
- [x] Remove commented-out code in summarise.ts:59-61 and caching.ts:48
- [x] Deduplicate `isVSCodeContext` (exists in both navigation_utils.ts and theme_context.tsx)
- [x] Fix hardcoded colors in error_boundary.tsx:154,163,176 (should use theme styles)

### Architecture Simplification (Larger Items)
- [ ] Simplify triple virtualization: useZoomCulling + useVirtualNodes + React Flow's onlyRenderVisibleElements conflict - pick one approach
- [ ] Unify `getFunctionProcessingSteps` and `getFunctionBusinessLogic` in summarise.ts (near-identical ~60 lines of structural duplication)
- [ ] Simplify caching.ts - replace RunnableBranch/RunnableLambda machinery with plain async function
- [ ] Make `summariseRootScope` use shared caching pattern instead of ad-hoc PouchDB get/put
- [ ] Extract message handlers from `showWebviewDiagram` god-function (190 lines mixing webview setup, message dispatch, state management)
- [ ] Consolidate click/keyboard/hover handlers duplicated between code_function_node.tsx and zoom_aware_node.tsx
- [x] Trim `ThemeColors` interface to only the 3-4 properties actually consumed (34 defined, only editor.foreground, editor.background, editorWidget.border read)
- [x] Remove duplicate `editorComment.foreground` / `editor.comment.foreground` from ThemeColors
- [x] Move `ThemeContextValue` from @code-charter/types to UI package (React-specific type in framework-agnostic package)
- [x] Consolidate 5 theme hooks down to 2 (keep useTheme + useFlowThemeStyles, delete useFlowTheme, useThemeColor, useThemeColors)
- [x] Remove connection lifecycle from CodeCharterBackend interface (only meaningful for VSCodeBackend, MockBackend fakes it with setTimeout)
- [x] Replace BackendProvider static singleton class with plain create_backend function
- [x] Fix fire-and-forget progress notification pattern in clustering_service.ts:50-61 (spawns independent unawaited notifications)
- [x] Decide on normalization behavior: old clustering service normalized matrices before combining, new one doesn't - document if intentional
- [x] Simplify config.ts - remove 13 individual config exports and 13 type aliases, keep only combined CONFIG
- [x] Remove build:lib and build:standalone contradictory scripts from ui/package.json
- [x] Remove experimentalDecorators/emitDecoratorMetadata from vscode/tsconfig.json (no decorators used)
- [x] Remove .next/** from turbo.json build outputs (no Next.js in monorepo)
- [x] Evaluate if @changesets/cli infrastructure is needed for this private monorepo

## Implementation Notes

### Approach
Used 10 parallel opus planner agents to analyze the entire codebase, then synthesized findings into 7 implementation phases executed sequentially.

### Completed (64 of 88 AC items)
- **Phase 1-2**: Deleted 10 dead files, removed 14 dead exports, cleaned 10 npm dependencies, fixed build configs
- **Phase 3**: Fixed 11 of 13 bugs (for...in, getModelDetails, layout cache, symbol separators, duplicate notifications, stale cache key, validate_provider_config, viewport selector, sort mutation, stale closure, search_panel formatting)
- **Phase 4**: Deleted 3 broken files, fixed 2 tests with ThemeProvider wrapper, rewrote 3 test files for current API
- **Phase 5**: Trimmed ThemeColors from 34 to 3 properties, moved ThemeContextValue to UI package, removed COLOR_CONFIG
- **Phase 6**: Removed CodeCharterUI, connection lifecycle, BackendProvider singleton; simplified config.ts exports; fixed fire-and-forget progress notification

### Deferred (24 AC items - complex refactors)
- Layout pipeline restructuring (wasted positions + module group bounding boxes)
- Triple virtualization simplification
- Summarise/caching deduplication
- showWebviewDiagram god-function extraction
- Handler consolidation between node components
- Theme-aware code_function_node.tsx and search_panel.tsx

### Statistics
- 8 commits, 70 files changed
- Net reduction: ~2,340 lines (-2,789 / +449)

## Review Details

### Reviewer Coverage Areas
1. **UI Components** - React component complexity, duplication, dead code
2. **Theme System** - 3 independent color systems, 5 theme hooks (only 2 used), dead FlowThemeProvider
3. **Backend/Provider Pattern** - phantom `Backend` type, broken test mock, static singleton anti-pattern
4. **VSCode Extension Core** - 190-line god-function, 4 dead files, getModelDetails bug
5. **Clustering Service** - dead old service, unused imports/params, validate_provider_config always returns true
6. **Summarise Module** - for...in bug, stale cache keys, duplicated summarization pipelines, RunnableBranch over-engineering
7. **Shared Types & Code Graph** - inconsistent symbol separators (#/::/:), dead re-export layer, ThemeColors bloat
8. **Code Chart Area** - triple virtualization conflict, wasted position computation, incorrect cache keys, syntax error
9. **Error Handling & Utils** - triple-fire error notifications, 5 dead error classes/hooks, over-engineered ErrorLogger/PerformanceMonitor
10. **Build Config & Monorepo** - ~200MB unused @tensorflow/tfjs-node, tests running twice, stale babel deps, contradictory build scripts

### Summary Statistics
- **Dead files identified**: 10 files to delete
- **Dead exports identified**: 14+ exported symbols never imported
- **Unused dependencies**: 8 packages to remove (including ~200MB @tensorflow/tfjs-node)
- **Critical bugs found**: 13 (including data corruption risks from cache key and for...in bugs)
- **Failing tests**: 24+ of 117 UI tests, 13+ of 17 VSCode test suites
- **Duplicate code patterns**: 5 significant duplications identified

---

## Detailed Findings by Reviewer

### 1. UI Components Review

**God Component**: `CodeChartAreaReactFlowInner` (code_chart_area_react_flow.tsx) is 514 lines handling data fetching, layout, virtualization, persistence, search, error display, theme styling, and toolbar rendering. Should be broken into `GraphToolbar`, `PersistenceControls`, `ZoomModeIndicator`, and a `use_graph_data` hook.

**Performance Issues**:
- `useStore` selector at line 98-102 creates `{ x, y, zoom }` on every render, defeating reference equality and causing all downstream computations to recalculate during pan/zoom
- `side_bar.tsx:103-105` calls `Array.sort()` during render without memoization, mutating the original array
- Each `ZoomAwareNode` subscribes independently to the zoom store (200+ subscriptions firing on every zoom change)
- `search_panel.tsx:29` casts all nodes on every state change without shallow equality

**Dead Code Audit**: 16 exported symbols never imported outside their own file, including entire files (`color_theme.ts`, `flow_theme_provider.tsx`, `flow_theme_switcher.tsx`, `test_react_flow.tsx`).

**Duplicate Logic**: Click/keyboard/hover handlers duplicated verbatim between `code_function_node.tsx` and `zoom_aware_node.tsx`. React.memo comparison functions nearly identical between the two.

### 2. Theme System Review

**Three independent color systems** coexist:
1. `color_theme.ts` - dead, reads CSS vars at module-load time (never updates)
2. `COLOR_CONFIG` in `config.ts` - static light-theme palette, bypasses theming
3. `Theme`/`ThemeColorConfig` pipeline - the actual theme system

**Five theme hooks**, only two used in production:
- `useTheme` (used) - returns raw ThemeContextValue
- `useFlowThemeStyles` (used) - returns mapped colors + style factories
- `useFlowTheme` (dead) - would throw since FlowThemeProvider never mounted
- `useThemeColor` (dead) - same issue
- `useThemeColors` (dead) - converts to CSS vars, never called

**FlowThemeProvider never mounted** in any JSX tree, making `flow_theme.css` rules inert (CSS variables never set).

**ThemeColors bloat**: 34 properties defined, only 3 individually read by consumers (`editor.foreground`, `editor.background`, `editorWidget.border`). Plus duplicate `editorComment.foreground` / `editor.comment.foreground`.

**Broken test**: `theme_provider.test.tsx` imports `../theme_provider` (doesn't exist) and tests methods (`getThemeColors()`, `getThemeType()`, `applyTheme()`) that don't exist on actual providers.

### 3. Backend/Provider Pattern Review

**Phantom type**: `test_mock_backend.ts` imports `Backend` from `@code-charter/types` which doesn't exist. The file implements method signatures incompatible with `CodeCharterBackend`.

**Phantom module**: Three files import from `contexts/backend_context` which doesn't exist:
- `__tests__/integration.test.tsx:5`
- `components/__tests__/code_charter_ui.test.tsx:5`
- `debug-entry.tsx:9`

**Over-engineering**: `BackendProvider` is a static singleton factory class with hidden mutable state (`private static currentBackend`). Should be a plain `create_backend()` function with instance management in React context.

**Connection lifecycle theater**: `MockBackend` fakes `connect()` with a 500ms setTimeout. The `connect/disconnect/getState/onStateChange` methods on `CodeCharterBackend` are only meaningful for VSCodeBackend.

**`useBackend` bugs**: Stale closure (eslint-disable masks it), redundant `isConnecting` state (tracks same thing as `state.status`).

**`Sidebar` unused backend**: Calls `useBackend()` and destructures `backend` but never uses it. Child `FunctionsList` independently calls the hook.

### 4. VSCode Extension Core Review

**God function**: `showWebviewDiagram` (extension.ts:60-248) is 190 lines mixing webview panel creation, mutable state management (`callGraph`, `topLevelFunctionToSummaries`, `projectManager`), inline message handlers, and dev watcher setup. Command handler map rebuilt on every message.

**`getModelDetails` bug**: Returns `undefined` for unrecognized providers (including `ModelProvider.VSCode` which is a valid enum member). Will crash at runtime at lines 152 and 165.

**`functionSummaryStatus` stub**: Handler always returns `{}` with TODO comment.

**Dead files**: `run.ts` (runCommand/execAsync never imported), `webviewApi.ts` (empty, 0 bytes), `git.ts` (getFileVersionHash never imported).

**`addToGitignore`**: Uses callback-style `fs.appendFile` mixed with sync `fs.existsSync`. Fire-and-forget with no `await`. Should use `fs.promises`.

**CSP nonce**: `getNonce()` uses `Math.random()` instead of `crypto.randomBytes`. Low severity (local webview only).

### 5. Clustering Service Review

**Dead file**: `clustering_service_old.ts` has zero imports. Both files export `ClusteringService` class name, causing confusion.

**Normalization removed silently**: Old service normalizes similarity and adjacency matrices via L1 normalization before combining. New service does NOT normalize. This changes clustering results - should be documented as intentional or restored.

**`validate_provider_config` always returns true**: Returns `true` even when user declines to provide API key (line 165). The guard in `clustering_service.ts:42-44` is dead logic.

**Fire-and-forget progress**: `withProgress()` called without awaiting at lines 50-61. Each progress report spawns an independent notification that races to close.

**Unused code**: `funcToIndex` parameter on `orderClustersByCentroid` (line 329) never referenced. `is_model_cached()` and `get_model_size()` never called. `import * as path` unused.

### 6. Summarise Module Review

**Critical bug**: `for (const clusterId in Object.keys(...))` at summariseClusters.ts:68 iterates array indices ("0","1","2") not values. Works by coincidence for sequential integer IDs.

**Stale cache**: `getFunctionBusinessLogic` at line 227 hashes only `node.symbol`. Cache never invalidates when upstream processing-steps summary changes.

**Over-engineered caching**: `caching.ts` uses `RunnableBranch`/`RunnableLambda` for what is: "if cached, return; else invoke chain and save." ~50 lines of indirection.

**Duplicated pipelines**: `getFunctionProcessingSteps` (lines 137-186) and `getFunctionBusinessLogic` (lines 188-259) follow identical structure, differing only in prompt and DB name.

**Inconsistent caching**: `summariseRootScope` implements ad-hoc PouchDB get/put while the other two use `getSummaryWithCachingChain`.

**Dead export**: `readCallGraphJsonFile` exported but never imported.

**Debug logging**: `console.log(modelDetails)` at line 27.

### 7. Shared Types & Code Graph Review

**Critical: Symbol separator inconsistency**:
- `vscode/shared/symbols.ts` splits on `#`
- `ui/symbol_utils.ts` splits on `::`
- `side_bar.tsx` splits on `:`
Same symbol string produces different results depending on which package processes it.

**Re-export indirection**: `codeGraph.ts` re-exports `CallGraph` and `TreeAndContextSummaries` from `@code-charter/types`/`@ariadnejs/core`. Consumers should import directly.

**Identical functions**: `symbolRepoLocalName` and `symbolDisplayName` in symbols.ts have identical implementations (lines 1-8).

**ThemeColors**: 34 fields, only 3 individually accessed. `editorComment.foreground` and `editor.comment.foreground` duplicate the same concept.

**24 failing UI tests**: `MockBackend` tests expect old plain-object format while implementation uses `Map`-based `CallGraph`.

### 8. Code Chart Area Review

**Triple virtualization conflict**: Three independent visibility-filtering systems operate in sequence:
1. `useZoomCulling` (line 131) - hash-based sampling by zoom level
2. `useVirtualNodes` (lines 134-139) - viewport visibility
3. `onlyRenderVisibleElements={true}` (line 338) - React Flow built-in

These conflict: `useZoomCulling` may remove nodes directly in viewport. Combined behavior is unpredictable.

**Wasted computation**: `react_flow_data_transform.ts:75-101` recursively calculates positions that `elk_layout.ts` immediately overwrites. Module group bounding boxes (lines 119-141) are calculated from pre-layout positions.

**Incorrect cache key**: `elk_layout.ts:52` uses `layout-${nodes.length}-${edges.length}`. Same count = same cache entry, even for structurally different graphs. `LayoutCache.generateKey()` exists but is never used.

**ELK hierarchy ignored**: All nodes (including those with `parentId`) flattened into single list. ELK doesn't know about module group containers.

**Syntax error**: `search_panel.tsx:179` fails TypeScript compilation.

**Test failures**: 16 of 109 tests fail across 4 suites (missing ThemeProvider wrappers, syntax error, test/implementation type mismatches).

### 9. Error Handling & Utils Review

**Triple-fire error pattern**: When a data-fetch error occurs (code_chart_area_react_flow.tsx:193-208):
1. `setError(error.message)` - sets component state
2. `errorLogger.log(error, 'error', ...)` - logs + stores in array nobody reads
3. `handleReactFlowError(error)` - creates notification via errorNotificationManager
4. `notify(...)` - creates SECOND notification via same manager

Every error = 2 user-visible notifications + 2 console entries.

**Over-engineered utilities**:
- `ErrorLogger` with `getErrorSummary()`, `getErrors()`, `clear()` all unused in production (in-memory buffer duplicates console)
- `PerformanceMonitor` with `getAverageMetrics()`, `clear()` never called (stores metrics nobody reads)
- `ErrorRecovery.gracefulDegrade` dead code; `tryWithFallback` used once in elk_layout.ts in a bizarre pattern (throws same error to trigger fallback)
- `ErrorNotificationManager` duplicates `useErrorNotification` hook

**9 failing tests**: All in error_handling.test.tsx - `ErrorNotifications` requires ThemeProvider wrapper.

**Keyboard navigation**: `showKeyboardShortcuts()` uses `alert()`. Documents "Enter/Space - Activate node" but no handler exists. `/` case is a no-op.

### 10. Build Config & Monorepo Review

**Heavyweight unused dependencies**:
- `@tensorflow/tfjs-node` (~200MB native module, never imported)
- `@xenova/transformers` (superseded by @huggingface/transformers)
- `@langchain/anthropic`, `@langchain/google-vertexai` (never imported)
- `@vscode/python-extension` (never imported)

**Tests run twice**: VSCode jest config picks up both `.ts` source and compiled `.js` in `out/`, plus stale test files like `refscope-integration.test.js` with no corresponding source.

**Conflicting transform**: Both Babel (`@babel/core`, `babel-jest`) and `ts-jest` installed. Only one pipeline needed.

**Contradictory build scripts**: `build:lib` and `build:standalone` use `--config tsup.config.ts --no-config` (specify config then ignore it).

**Stale config**: `turbo.json` lists `.next/**` as build output (no Next.js), `experimentalDecorators`/`emitDecoratorMetadata` enabled (no decorators used), `@changesets/cli` infrastructure for a private monorepo at v0.0.1.
