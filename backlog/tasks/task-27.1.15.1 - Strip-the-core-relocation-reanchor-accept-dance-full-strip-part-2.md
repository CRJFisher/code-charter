---
id: TASK-27.1.15.1
title: Strip the core relocation/reanchor accept-dance (full strip part 2)
status: Done
assignee: []
created_date: "2026-06-09 15:14"
labels:
  - drift
  - graph-db
  - simplification
dependencies:
  - TASK-27.1.15
references:
  - task-27.0.3
  - task-27.1.2
  - task-27.1.6.4
parent_task_id: TASK-27.1.15
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

With customisation agent-mediated everywhere, a relocated symbol's attached content needs no human accept-gate: the agent re-anchors or regenerates it. The relocation/`reanchor` accept-dance — `re_extract` staging drift attributes on a relocated symbol instead of re-anchoring inline, `reanchor_node`, `outstanding_drift`, and the `drift.resolve {reanchor}` arm — exists only to surface an authored-content move for explicit acceptance. It is removed; a relocation re-anchors inline (the content rides across, a content-hash cache hit for descriptions) with no staged-drift round trip.

This is the core (task-27.0) half of the full strip, isolated from part 1 (task-27.1.15) so its blast radius is reviewable on its own. After it, `drift.resolve` has no remaining arm, and the drift MCP server and the SessionStart hook are removed entirely.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 `re_extract` re-anchors a relocated symbol inline instead of staging drift for explicit accept; the relocated→stage-drift branch (re*extract.ts:147-159) and the `DRIFT*\*`status keys are removed. A description rides across the rename via the inline re-anchor / content-hash cache, with no`drift.resolve` step.
- [x] #2 Remove `reanchor_node`, `outstanding_drift`, and the `drift.resolve {reanchor}` arm. With the last arm gone, remove `drift.resolve` and the whole drift MCP server — `build_drift_server`, the `drift_mcp` bin entry, the `.mcp.json` registration, and the installer MCP wiring.
- [x] #3 Remove the SessionStart hook and its installer entry once it has nothing left to announce (the bin half went in part 1; the relocation half goes here).
- [x] #4 Membership-drift re-sync still handles a relocated member: the symbol-level delta (task-27.1.6.4) reshapes induced membership and re-syncs the affected flow. Verify with a relocation fixture — no regression.
- [x] #5 No shims — full removal, all callers and tests updated; the drift MCP and SessionStart test suites are deleted, not edited. Full suite green.
<!-- AC:END -->

## Implementation Notes

## High-level summary

A relocated symbol's preserved content follows the symbol inline, in the same `re_extract` pass that detects the move. `reconcile_node`'s relocation verdict re-keys an `agentic.description` side-node to `description_node_id(new symbol_path)` — the id embeds the symbol_path, which is the describe cache's key — updates the node's defining `path` and `anchor`, and retires the old-id row. An unchanged body is a content-hash cache hit downstream, so the description rides across a rename byte-for-byte with nothing regenerated and no accept gate. Verdicts are computed against the pre-pass snapshot and applied in two phases (all soft-deletes, then all re-key upserts), and a re-key whose target id already holds a live row skips the upsert — the resolver prefers a path match over a relocation, so that row tracks the same path itself and is never clobbered.

With the last `drift.resolve` arm gone, the entire drift MCP server is removed: `build_drift_server`, `drift_tool`, `call_log`, `tool_names`, the `drift_mcp` bin, the `.mcp.json` registration (file deleted), the installer's MCP wiring (`merge_mcp_server`, `read_mcp_server`, `McpServerEntry`, `mcp_config_file`), and the `@modelcontextprotocol/sdk`/`zod` dependencies. The SessionStart hook goes with it: bin, banner module, installer spec, settings group, and the wire types. `resolve_db_path` survives (the Stop hook and the drift-sync skill resolve the store path through it) and lives in `src/hooks/` beside its consumer. The `relocated_targets` describe-exclusion plumb through `reconcile`/`hydrate` is removed — the re-keyed cache makes it redundant.

### How the acceptance criteria were addressed

- **#1** — the relocated→stage-drift branch and `drift_observation.ts` (all `DRIFT_*` keys) are deleted; `re_extract.test.ts` pins the inline re-anchor (anchor, path, description, and `description_hash` at the new id; old id retired; no `drift_status` anywhere), plus the no-clobber cases for a live hit and a body-changed twin at the target id.
- **#2** — `reanchor.ts`, `outstanding_drift`, and `src/mcp/` are deleted wholesale; the `drift_mcp` bin, `.mcp.json`, installer MCP wiring, and the `enabledMcpjsonServers` entry are removed.
- **#3** — the SessionStart bin, `session_start_banner.ts`, the installer's SessionStart spec (`HookEventName` narrows to `"Stop"`), and the committed settings group are removed; the b4d63da Stop-hook pending-file chain is untouched.
- **#4** — `reconcile_delta.test.ts`'s relocate fixtures cover the membership-drift path end-to-end: a two-turn rename (byte-identical description at the re-keyed id, exactly one live node in the lineage, no regeneration on a later unrelated edit), a cross-file move (the side-node's `path` follows), and a rename of an undescribed member (fresh description at the new path, no stale node).
- **#5** — the MCP and SessionStart suites are deleted, not edited; all callers updated; suites green.

Decisions: the re-key (over teaching the describe cache to read anchors) keeps the "id embeds the current symbol_path" invariant in one place — `write_descriptions` owns both the constructor and, via `re_extract`'s import, the relocation re-key. The installer deliberately does NOT sweep stale SessionStart/`.mcp.json` entries from previously installed hosts: that would be a migration shim (no-backwards-compat constitution); the only known install — this repo — carries the cleanup in its committed config.

