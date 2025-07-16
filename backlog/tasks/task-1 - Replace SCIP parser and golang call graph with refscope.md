---
id: task-1
title: Replace SCIP parser and golang call graph with refscope
status: To Do
assignee: []
created_date: '2025-07-15'
labels: []
dependencies: []
---

## Description

The VSCode extension currently relies on SCIP parser and golang-based call graph detection code that requires Docker to run. This task involves migrating to the new `refscope` TypeScript library to eliminate the Docker dependency and enable native execution within the VSCode extension.

## Acceptance Criteria

- [ ] SCIP parser is no longer required
- [ ] Golang call graph detection code is removed
- [ ] refscope library is integrated into the VSCode extension
- [ ] Call graph detection works natively without Docker
- [ ] All existing call graph functionality is preserved
- [ ] Docker dependency and setup instructions are removed
- [ ] Extension can generate call graphs for supported languages using refscope