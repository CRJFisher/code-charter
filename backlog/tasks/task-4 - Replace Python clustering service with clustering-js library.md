---
id: task-4
title: Replace Python clustering service with clustering-js library
status: To Do
assignee: []
created_date: '2025-07-15'
labels: []
dependencies: []
---

## Description

The VSCode extension currently relies on a separate Python process (charter/clustering.py) running on port 5000 to perform code clustering. This task involves migrating to the new clustering-js TypeScript/JavaScript library to eliminate the Python dependency and simplify the extension architecture.

## Acceptance Criteria

- [ ] Python clustering service is no longer required
- [ ] clustering-js library is integrated into the VSCode extension
- [ ] Clustering functionality works identically to the Python implementation
- [ ] HTTP calls to localhost:5000/cluster are replaced with direct library calls
- [ ] Python service cleanup is documented
- [ ] Old Python dependencies and setup instructions are removed
