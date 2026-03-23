---
id: TASK-15
title: Replace RegexDocstringProvider with ariadne docstrings everywhere
status: To Do
assignee: []
created_date: '2026-03-23 09:29'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The VS Code extension already uses ariadne's tree-sitter-extracted docstrings (node.definition.docstring), but the CLI init_command, the cluster_pipeline.mjs script, and the VS Code docstrings/ module still use regex-based docstring extraction. This creates a maintenance burden with two parallel docstring extraction paths and means the CLI/pipeline produce lower-quality results than the extension. All consumers should use ariadne as the single source of docstrings, allowing the RegexDocstringProvider and the DocstringProvider interface to be removed entirely.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] CLI init_command uses ariadne docstrings instead of RegexDocstringProvider
- [ ] cluster_pipeline.mjs uses ariadne docstrings instead of its inline regex extraction
- [ ] RegexDocstringProvider class is deleted from both packages/cli and packages/vscode
- [ ] DocstringProvider interface is removed from @code-charter/types if no longer needed
- [ ] All existing tests pass with the new docstring source
- [ ] Docstring coverage is equivalent or better than the regex approach
<!-- AC:END -->
