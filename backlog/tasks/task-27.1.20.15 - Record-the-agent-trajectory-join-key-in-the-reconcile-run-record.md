---
id: TASK-27.1.20.15
title: Record the agent-trajectory join key in the reconcile run record
status: To Do
assignee: []
created_date: "2026-07-09"
labels:
  - drift
  - observability
dependencies: []
parent_task_id: TASK-27.1.20
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The reconcile run log (.3) persists the *effect* of each sync — per-flow outcomes with reasons, describe tallies, sync status — but not the *trajectory* that produced it. The Stop hook receives `payload.session_id` (drift_stop_hook.ts) and discards it, so the instruction the reconciler was given and the context it gathered are unjoinable to the outcome they produced. The session transcript is directly derivable from the join key (`~/.claude/projects/<slugified-cwd>/<session_id>.jsonl`) — no discovery machinery needed — but only if the key is persisted. General rule this task installs: an agentic mechanism's run record carries the join key to its transcript, or its verify loop has nothing to read. All trajectory tooling (.16, .17) depends on this one field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 session_id and cwd ride the pending-reconcile handoff (written by the Stop hook, consumed by the reconcile bin), and each drift_reconcile_log.jsonl record persists session_id, the derived transcript path, and the verbatim reconciler instruction the hook issued
- [ ] #2 Hand-invoked and no-session runs record session_id: null (and omit the transcript path) without erroring; --dry-run behaviour is unchanged (writes neither sidecar)
- [ ] #3 The run-record format is specified in a versioned, pinned contract doc in packages/drift (per decision-10): mechanism-agnostic keys (run_id, session_id, transcript path, instruction, timestamps) at top level, drift-specific payload (flow outcomes, describe tallies) under a nested detail key — existing .3 fields migrate into that split in the same change

<!-- AC:END -->
