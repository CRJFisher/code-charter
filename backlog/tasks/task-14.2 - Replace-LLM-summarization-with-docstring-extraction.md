---
id: TASK-14.2
title: Replace LLM summarization with docstring extraction
status: Done
assignee: []
created_date: '2026-03-19'
updated_date: '2026-05-24 14:09'
labels: []
dependencies:
  - task-14.1
parent_task_id: TASK-14
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the LangChain/PouchDB summarization pipeline. Create a DocstringProvider interface with RegexDocstringProvider fallback. Replace TreeAndContextSummaries with DocstringSummaries. Rewrite extension handlers to extract docstrings from call graph. Update all UI consumers atomically. Extract cluster graph utilities from summariseClusters.ts before deleting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DocstringProvider interface defined with RegexDocstringProvider implementation
- [ ] #2 TreeAndContextSummaries replaced with DocstringSummaries across all packages (atomic commit)
- [ ] #3 Extension summariseCodeTree handler rewritten to extract docstrings via BFS walk
- [ ] #4 LangChain and PouchDB dependencies removed
- [ ] #5 summarise/ directory deleted (graph utils extracted to clustering/ first)
- [ ] #6 All UI consumers updated: react_flow_data_transform App backends mocks tests
- [ ] #7 Undocumented functions fall back to name+signature display
- [ ] #8 Clustering quality benchmark captured before and after switch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
LLM summarization pipeline (LangChain/PouchDB) removed. Docstring extraction now uses ariadne's native docstrings (commit 30bda20). summarise/ directory and TreeAndContextSummaries gone from source.
<!-- SECTION:NOTES:END -->
