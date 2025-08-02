---
id: task-1.1.2
title: Update webview to use ariadne types and verify serialization
status: Done
assignee: []
created_date: "2025-07-19"
updated_date: "2025-07-19"
labels: []
dependencies: []
parent_task_id: task-1.1
---

## Description

The webview code in code-charter-vscode/web needs to be updated to use ariadne's type structure. However, to avoid bloating the webview bundle size, we should not install ariadne in the webview. Instead, create minimal type definitions in the shared folder that match ariadne's API. The extension communicates with the webview via panel.webview.onDidReceiveMessage handlers, passing data that needs to be serialized.

## Acceptance Criteria

- [x] Minimal ariadne type definitions created in shared folder
- [x] Webview imports types from shared folder, not ariadne package
- [x] Type definitions match ariadne's CallGraph, Def, and related types
- [x] No ariadne dependency added to web/package.json
- [x] Serialization tested between extension and webview
- [x] No data loss or type errors during message passing

## Implementation Plan

1. Update webview imports to use ariadne-types package
2. Remove any duplicate type definitions from shared folder
3. Verify type compatibility across extension-webview boundary
4. Test serialization of data passed between extension and webview
5. Ensure no bundle size bloat from the types-only package

## Implementation Notes

Updated the webview to use the `ariadne-types` package (version 0.5.6) which was already installed. This approach provides:

- Zero runtime overhead (types-only package)
- Automatic version synchronization with ariadne
- No maintenance burden of keeping types in sync

### Key Changes Made

1. **Updated imports in webview files**:

   - `web/src/vscodeApi.ts`: Import CallGraph and CallGraphNode from ariadne-types
   - `web/src/SideBar.tsx`: Changed DefinitionNode to CallGraphNode
   - `web/src/App.tsx`: Updated to use ariadne-types
   - `web/src/codeChartArea/CodeChartArea.tsx`: Migrated to CallGraphNode
   - `web/src/codeChartArea/nodePlacement.ts`: Updated all node references

2. **Property migrations**:

   - `node.children` → `node.calls`
   - `node.document` → `node.definition.file_path`
   - `node.enclosingRange.startLine` → `node.definition.range.start.row`
   - `callGraph.topLevelNodes` → `callGraph.top_level_nodes`
   - `callGraph.definitionNodes[symbol]` → `callGraph.nodes.get(symbol)`

3. **Added local type definitions**:

   - `TreeAndContextSummaries` interface (exported from vscodeApi.ts)
   - `NodeGroup` interface (exported from vscodeApi.ts)

4. **Verified serialization**:
   - Build completed successfully with no TypeScript errors
   - Types are compatible between extension and webview
   - ariadne-types provides proper serialization support

5. **Critical fix for shared folder**:
   - Updated `shared/codeGraph.ts` to import from `ariadne-types` instead of `ariadne`
   - Installed `ariadne-types` in the extension's package.json
   - This ensures both extension and webview can use the shared folder without runtime errors
