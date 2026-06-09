---
description: Manually reconcile code-to-diagram drift for recently changed files (the Stop-hook fallback).
allowed-tools: Bash(git status:*), Bash(git diff:*), Task
---

# /drift

Manually trigger drift reconciliation. This is the fallback for hosts or sessions without the
`Stop` hook — it does by hand what the `Stop` hook does automatically.

Steps:

1. Determine the changed-file set: run `git status --porcelain` (and, if a last-reconciled
   watermark exists, `git diff --name-only` against it) to list files whose flow diagrams may be
   stale.
2. If there are changed files, launch the `drift-reconciler` sub-agent (via the Task/Agent tool)
   to reconcile exactly those files, handing it the list explicitly — on this manual path no Stop
   hook ran, so nothing is staged for it to fetch. The sub-agent invokes the `drift-sync` skill
   with that list and returns a brief acknowledgement.
3. Where custom sub-agents are unsupported, invoke the `drift-sync` skill directly over the
   changed files. Separately, when a prior session's reconcile staged a code rename as outstanding
   drift, accept the re-anchor with the `drift.resolve` MCP tool
   (`{ kind: "node", id, resolution: "reanchor" }`) using the node ids the SessionStart banner lists.

Report a one-line summary of how many files were reconciled. Do not reconcile inline beyond
delegating to `drift-reconciler` / `drift-sync`.
