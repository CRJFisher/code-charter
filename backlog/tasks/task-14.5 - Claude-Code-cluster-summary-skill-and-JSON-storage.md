---
id: task-14.5
title: Claude Code cluster summary skill and JSON storage
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-14.3
  - task-14.4
parent_task_id: task-14
---

## Description

Create the /update-cluster-summaries skill that runs clustering and generates/updates cluster summaries. Create JSON storage: cluster-summaries.json (committed) and .code-charter/cache.json (gitignored). The skill runs the clustering pipeline via a Node.js script, compares with previous clusters, and has Claude generate summaries for changed clusters. Add Phase 2 to the stop hook as a non-blocking advisory check (fingerprint comparison only).

## Acceptance Criteria

- [ ] Skill at .claude/skills/update-cluster-summaries/SKILL.md
- [ ] cluster-summaries.json schema defined and implemented
- [ ] cache.json for embeddings and cluster assignments (gitignored)
- [ ] Skill runs clustering pipeline and generates summaries for changed clusters
- [ ] Summaries are action-focused telegraph-style <120 chars
- [ ] Clusters processed in dependency order (topological sort)
- [ ] Stop hook Phase 2 added: fingerprint-only staleness check (non-blocking)
- [ ] Selective .gitignore: commit cluster-summaries.json and ignore .code-charter/cache.json
- [ ] Post-skill validation: schema conformance and length constraints
- [ ] End-to-end test: hook detects staleness -> skill generates summaries -> hook passes
