---
id: task-1
title: Replace SCIP parser and golang call graph with ariadne
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

The VSCode extension currently relies on SCIP parser and golang-based call graph detection code that requires Docker to run. This task involves migrating to the new [ariadne](https://www.npmjs.com/package/ariadne) TypeScript library to eliminate the Docker dependency and enable native execution within the VSCode extension.

## Acceptance Criteria

- [ ] SCIP parser is no longer required
- [ ] Golang call graph detection code is removed
- [ ] ariadne library is integrated into the VSCode extension
- [ ] Call graph detection works natively without Docker
- [ ] All existing call graph functionality is preserved
- [ ] Docker dependency and setup instructions are removed
- [ ] Extension can generate call graphs for supported languages using ariadne
- [ ] Extensive unit tests are written for the ariadne integration

## Implementation Plan

1. Install and explore ariadne library capabilities
2. Create TypeScript module to replace golang call graph detector
3. Implement SCIP-equivalent parsing using ariadne
4. Port call graph detection logic from golang to TypeScript
5. Remove Docker dependencies from VSCode extension
6. Update extension to use native ariadne implementation
7. Test with existing Python projects
8. Remove Docker-related code and documentation

## Implementation Notes

This task has been split into the following subtasks:

- task-1.1: Integrate ariadne detector into VSCode extension
- task-1.2: Remove Docker dependencies and SCIP/Golang code

The ariadne library now has all required APIs implemented (get_definitions, get_calls_from_definition, get_call_graph) as documented in the ariadne-call-graph-api-updates.md file. Each subtask represents a logical step in the migration process.
