---
id: TASK-16
title: Fix React Flow layout and correctness bugs
status: To Do
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
- [ ] ELK layout uses hierarchical children arrays (or 3-pass algorithm) so child nodes are positioned correctly relative to parent module groups
- [ ] Module group dimensions are calculated after ELK layout (not before) so they accurately encompass child nodes
- [ ] Data-fetching useEffect has cancellation (AbortController or cancelled flag) preventing stale data overwrites on rapid entry point changes
- [ ] CodeFunctionNode uses useFlowThemeStyles() instead of hardcoded hex colors for all 8+ color values
- [ ] Search input escapes regex metacharacters before constructing RegExp (no SyntaxError on special characters)
- [ ] acquireVsCodeApi() is called once at module scope and cached (not on every navigation click)
- [ ] Stale flow_theme.css import is removed from code_chart_area_react_flow.tsx
- [ ] All changes verified working in both light and dark VS Code themes
<!-- AC:END -->
