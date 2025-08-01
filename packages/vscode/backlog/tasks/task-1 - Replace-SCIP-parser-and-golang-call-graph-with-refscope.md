---
id: task-1
title: Replace SCIP parser and golang call graph with refscope
status: In Progress
assignee:
  - "@chuck"
created_date: "2025-07-15"
updated_date: "2025-07-19"
labels: []
dependencies:
  - task-1.1
  - task-1.2
---

## Description

The VSCode extension currently relies on SCIP parser and golang-based call graph detection code that requires Docker to run. This task involves migrating to the new [refscope](https://www.npmjs.com/package/refscope) TypeScript library to eliminate the Docker dependency and enable native execution within the VSCode extension.

## Acceptance Criteria

- [ ] SCIP parser is no longer required
- [ ] Golang call graph detection code is removed
- [ ] refscope library is integrated into the VSCode extension
- [ ] Call graph detection works natively without Docker
- [ ] All existing call graph functionality is preserved
- [ ] Docker dependency and setup instructions are removed
- [ ] Extension can generate call graphs for supported languages using refscope
- [ ] Extensive unit tests are written for the refscope integration

## Implementation Plan

1. Install and explore refscope library capabilities
2. Create TypeScript module to replace golang call graph detector
3. Implement SCIP-equivalent parsing using refscope
4. Port call graph detection logic from golang to TypeScript
5. Remove Docker dependencies from VSCode extension
6. Update extension to use native refscope implementation
7. Test with existing Python projects
8. Remove Docker-related code and documentation

## Implementation Notes

This task has been split into the following subtasks:

- task-1.1: Integrate refscope detector into VSCode extension
- task-1.2: Remove Docker dependencies and SCIP/Golang code

The refscope library now has all required APIs implemented (get_definitions, get_calls_from_definition, get_call_graph) as documented in the refscope-call-graph-api-updates.md file. Each subtask represents a logical step in the migration process.