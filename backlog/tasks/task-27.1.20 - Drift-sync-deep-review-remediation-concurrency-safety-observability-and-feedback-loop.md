---
id: TASK-27.1.20
title: >-
  Drift sync deep-review remediation: concurrency safety, observability, and
  feedback loop
status: To Do
assignee: []
created_date: "2026-07-05 13:49"
labels:
  - drift
  - tech-debt
  - observability
  - dx
dependencies: []
parent_task_id: TASK-27.1
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Umbrella for the remediation work identified by the 49-agent drift-sync deep review (backlog/drafts/drift-sync-*.md). The deterministic reconcile engine is sound and well-tested; the weaknesses are structural and shared across both review goals (implementation correctness + developer feedback loop).

Three root causes dominate:

1. CONCURRENCY VACUUM — three uncoordinated actors (Stop-hook reconcile subprocess, a possible second /drift reconcile, the VS Code extension) share graph.db and drift_pending_reconcile.json with no WAL, no busy_timeout, no lockfile, and non-atomic writes. Every high-severity data-integrity finding traces here.
2. MISSING FINAL PIPELINE STAGE — nothing watches graph.db, so reconcile results never reach an open webview without a manual Generate Diagram.
3. SILENCE BY DESIGN — the hook exits 0 on any error, installs swallow exceptions, stderr lands in a Claude session that is a different process from VS Code, and no durable record exists anywhere, so correctness bugs and healthy no-ops are indistinguishable.

Strategy: build the observability-and-safety spine first (it unblocks everything), then the tooling that reads it, then the deterministic dev loop, then agentic quality + docs. Sub-tasks are ordered by dependency; each sub-task depends only on lower-numbered siblings.

Source: backlog/drafts/drift-sync-deep-review.md, drift-sync-review-implementation.md, drift-sync-review-feedback-loop.md.
<!-- SECTION:DESCRIPTION:END -->
