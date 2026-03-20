---
id: task-14.2
title: Replace LLM summarization with docstring extraction
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies:
  - task-14.1
parent_task_id: task-14
---

## Description

Remove the LangChain/PouchDB summarization pipeline. Create a DocstringProvider interface with RegexDocstringProvider fallback. Replace TreeAndContextSummaries with DocstringSummaries. Rewrite extension handlers to extract docstrings from call graph. Update all UI consumers atomically. Extract cluster graph utilities from summariseClusters.ts before deleting.

## Acceptance Criteria

- [ ] DocstringProvider interface defined with RegexDocstringProvider implementation
- [ ] TreeAndContextSummaries replaced with DocstringSummaries across all packages (atomic commit)
- [ ] Extension summariseCodeTree handler rewritten to extract docstrings via BFS walk
- [ ] LangChain and PouchDB dependencies removed
- [ ] summarise/ directory deleted (graph utils extracted to clustering/ first)
- [ ] All UI consumers updated: react_flow_data_transform App backends mocks tests
- [ ] Undocumented functions fall back to name+signature display
- [ ] Clustering quality benchmark captured before and after switch
