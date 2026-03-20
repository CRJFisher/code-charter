---
id: task-14.4
title: Claude Code docstring enforcement hook
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-14.2
parent_task_id: task-14
---

## Description

Create a Claude Code Stop hook that enforces docstrings on modified/added functions. Phase 1 only (no clustering). Uses DocstringProvider interface with regex fallback. Scoped to modified functions in git diff, not all functions in changed files. Tiered enforcement: required for exported/public/non-trivial, exempt for one-liners and anonymous. Block message includes explanation and offer to generate. Respects stop_hook_active to prevent infinite loops.

## Acceptance Criteria

- [ ] Stop hook script at .claude/hooks/stop_check.mjs
- [ ] Hook configured in .claude/settings.json under hooks.Stop
- [ ] Uses DocstringProvider interface (regex fallback works without ariadne)
- [ ] Only checks functions modified or added in current git diff
- [ ] Exported and public functions with >10 lines require docstrings
- [ ] One-liners and anonymous functions exempt
- [ ] Block message explains why and offers to generate docstrings
- [ ] stop_hook_active=true always allows stopping
- [ ] Test files and generated files excluded
- [ ] Hook decomposed into testable pure functions
- [ ] Tests cover: all documented (pass) some missing (block) empty diff (pass) stop_hook_active (pass) parse errors (graceful)
