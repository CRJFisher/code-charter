---
id: TASK-15
title: Replace RegexDocstringProvider with ariadne docstrings everywhere
status: Done
assignee: []
created_date: '2026-03-23 09:29'
updated_date: '2026-05-24 14:09'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The VS Code extension already uses ariadne's tree-sitter-extracted docstrings (node.definition.docstring), but the CLI init_command, the cluster_pipeline.mjs script, and the VS Code docstrings/ module still use regex-based docstring extraction. This creates a maintenance burden with two parallel docstring extraction paths and means the CLI/pipeline produce lower-quality results than the extension. All consumers should use ariadne as the single source of docstrings, allowing the RegexDocstringProvider and the DocstringProvider interface to be removed entirely.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLI init_command uses ariadne docstrings instead of RegexDocstringProvider
- [ ] #2 cluster_pipeline.mjs uses ariadne docstrings instead of its inline regex extraction
- [ ] #3 RegexDocstringProvider class is deleted from both packages/cli and packages/vscode
- [ ] #4 DocstringProvider interface is removed from @code-charter/types if no longer needed
- [ ] #5 All existing tests pass with the new docstring source
- [ ] #6 Docstring coverage is equivalent or better than the regex approach
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in commit 30bda20. RegexDocstringProvider and DocstringProvider interface removed. CLI package deleted entirely. Ariadne tree-sitter docstrings are the sole source.
<!-- SECTION:NOTES:END -->
