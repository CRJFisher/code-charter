---
id: TASK-24.1
title: First-run embedding model download consent UX
status: To Do
assignee: []
created_date: '2026-05-24'
updated_date: '2026-05-24 14:10'
labels:
  - clustering
  - embeddings
  - ux
dependencies:
  - task-24
parent_task_id: TASK-24
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
task-24 ships with silent auto-download of the ~160 MB Jina ONNX model on first use. This subtask layers a first-run consent UX on top so users understand what's about to happen, can defer or decline, and — when a better default model later ships — get a clear, asked-once prompt rather than a surprise re-download.

The consent layer must NOT regress the zero-config "happy path": a one-time prompt with a sensible default and a "don't ask again" persists the user's choice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On the very first run after install (CLI or VSCode), before any model download starts, the user sees a consent message stating: the model id, the approximate download size, the cache location, and the fact that no data leaves the machine. CLI: stderr prompt with `[Y/n]`. VSCode: `vscode.window.showInformationMessage` with `Download`, `Choose another provider`, `Cancel` actions
- [ ] #2 User choice is persisted: CLI in `~/.config/code-charter/preferences.json` (or platform equivalent via `env-paths`); VSCode in `Memento` via `context.globalState`. The shape includes `{ default_provider_consent: { provider_id, model_id, dtype, version, accepted_at } }`
- [ ] #3 Subsequent runs do NOT prompt if the persisted consent matches the model the run wants to load
- [ ] #4 When the default recommended model changes in a future code-charter release, the run detects mismatch (`persisted.model_id !== default.model_id` or `persisted.version < default.min_version`) and prompts again with an "Update" / "Keep current" / "Choose another" choice, NOT a silent re-download
- [ ] #5 User can revoke consent: CLI flag `code-charter consent --reset`; VSCode command `Code Charter: Reset Embedding Provider Consent`
- [ ] #6 User can decline the local model and pick another provider at the prompt — wiring routes through the provider-selection plumbing from task-24.2 (this task ships against that interface; do not duplicate config storage)
- [ ] #7 All download progress (when consented) still uses the cancellable progress UX from task-24 AC #15
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `packages/cli/src/preferences.ts` (or equivalent) reading/writing `~/.config/code-charter/preferences.json` via `env-paths`
2. Add `ConsentManager` interface used by both CLI and extension; CLI implementation uses preferences file, VSCode implementation uses `context.globalState`
3. Wrap the embedding provider's initialise step: check consent → if absent or stale, run the prompt → on accept, proceed; on decline, surface provider-picker (task-24.2) or exit
4. Add VSCode command + CLI subcommand for consent reset
5. Tests: consent-persisted-no-prompt; model-id-change-prompts-again; decline-prompt-routes-to-provider-picker

## Out of scope

- Provider configuration itself (handled by task-24.2)
- Telemetry on consent acceptance rates
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CLI package deleted. Drop the CLI subcommand and preferences.json AC items; keep VSCode Memento + command. Retarget any cli paths to packages/vscode.
<!-- SECTION:NOTES:END -->
