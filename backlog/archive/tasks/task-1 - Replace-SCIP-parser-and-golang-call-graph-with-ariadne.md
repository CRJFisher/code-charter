---
id: task-1
title: Replace SCIP parser and golang call graph with ariadne
status: Done
assignee:
  - '@chuck'
created_date: '2025-07-15'
updated_date: '2025-08-02'
labels: []
dependencies:
  - task-1.1
  - task-1.2
---

## Description

The VSCode extension currently relies on SCIP parser and golang-based call graph detection code that requires Docker to run. This task involves migrating to the new [ariadne](https://www.npmjs.com/package/ariadne) TypeScript library to eliminate the Docker dependency and enable native execution within the VSCode extension.

## Acceptance Criteria

- [x] SCIP parser is no longer required
- [x] Golang call graph detection code is removed
- [x] ariadne library is integrated into the VSCode extension
- [x] Call graph detection works natively without Docker
- [x] All existing call graph functionality is preserved
- [x] Docker dependency and setup instructions are removed
- [x] Extension can generate call graphs for supported languages using ariadne
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

- task-1.1: Integrate ariadne detector into VSCode extension (Done)
- task-1.2: Remove Docker dependencies and SCIP/Golang code (Done)

The ariadne library now has all required APIs implemented (get_definitions, get_calls_from_definition, get_call_graph) as documented in the ariadne-call-graph-api-updates.md file. Each subtask represents a logical step in the migration process.

### Implementation Summary

Successfully migrated from SCIP parser and golang call graph to ariadne:

1. **Integrated ariadne detector** (task-1.1):
   - Replaced Docker-based implementation with native TypeScript
   - Updated all type definitions to use @ariadnejs/types
   - Modified webview communication to work with new types
   - Removed ProjectEnvironment and environment detection code

2. **Removed Docker dependencies** (task-1.2):
   - Deleted entire docker/ directory with SCIP indexer
   - Removed src/lib-scip-detector/ and golang code
   - Cleaned up VSCode debug launch configurations
   - Updated all documentation

3. **Outstanding work**:
   - Unit tests for ariadne integration are still needed
   - task-1.3 (incremental parsing API) is optional future enhancement

The migration is functionally complete with all Docker dependencies removed and the extension now using ariadne natively.
