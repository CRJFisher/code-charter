---
id: task-14.6
title: Bootstrap CLI and documentation
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-14.5
parent_task_id: task-14
---

## Description

Create a code-charter init command that works independently of Claude Code. Scans codebase, reports documentation coverage, runs clustering, generates initial cluster summaries. Update README, create decision document. This ensures code-charter works for VS Code-only users who don't use Claude Code.

## Acceptance Criteria

- [ ] code-charter init CLI command or VS Code command exists
- [ ] Init scans codebase and reports documentation coverage percentage
- [ ] Init runs clustering pipeline and generates initial cluster-summaries.json
- [ ] Init works without Claude Code hooks (standalone)
- [ ] VS Code extension shows helpful empty state when cluster-summaries.json missing
- [ ] README updated: remove Ollama prerequisite and add Claude Code setup and standalone usage
- [ ] Decision document created: backlog/decisions/decision-1
- [ ] vision.md updated to reflect docstring-driven approach
