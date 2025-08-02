---
id: task-1.2
title: Remove Docker dependencies and SCIP/Golang code
status: Done
assignee: []
created_date: "2025-07-19"
updated_date: "2025-07-19"
labels: []
dependencies: []
parent_task_id: task-1
---

## Description

Remove all Docker-related code, SCIP parser dependencies, and Golang call graph detector from the codebase. This is a cleanup task that removes the old infrastructure.

## Acceptance Criteria

- [x] Docker dependencies removed from package.json
- [x] Docker setup code removed from extension
- [x] SCIP parser Docker image references removed
- [x] Golang call graph detector code removed
- [x] Docker availability checks removed
- [x] Documentation updated to remove Docker requirements

## Implementation Plan

1. Search for Docker-related dependencies and code
2. Remove Docker dependencies from package.json
3. Remove Docker setup and availability check code
4. Remove SCIP parser Docker references
5. Remove Golang call graph detector
6. Update documentation
7. Test extension still works properly

## Implementation Notes

Successfully removed all Docker-related infrastructure from the codebase:

- Removed `docker.ts` file containing Docker availability checks
- Removed entire `docker/` directory containing SCIP Python and Golang call graph detector Dockerfiles
- Removed `dev/build_call_graph_image.sh` build script
- Removed Go module files (`go.mod`, `go.sum`) containing Docker dependencies
- Updated README.md to remove Docker from prerequisites
- No Docker dependencies found in package.json files

Files removed:

- `/code-charter-vscode/src/docker.ts`
- `/docker/scip-python/Dockerfile.distroless`
- `/docker/call-graph-detector/Dockerfile.distroless`
- `/dev/build_call_graph_image.sh`
- `/go.mod`
- `/go.sum`

Note: `charter/clustering.py` contains a Docker reference but was left as-is per user request as it needs specific migration work.
