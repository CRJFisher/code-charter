---
id: TASK-24.2
title: Pluggable embedding provider configuration and key storage
status: To Do
assignee: []
created_date: '2026-05-24'
updated_date: '2026-05-24 14:10'
labels:
  - clustering
  - embeddings
  - config
dependencies:
  - task-24
parent_task_id: TASK-24
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
task-24 keeps the `EmbeddingProvider` interface as the seam for future providers. This subtask adds the configuration surface that selects which provider runs, stores API keys / endpoints securely, and routes the clustering layer to the chosen provider without touching its code.

This is the foundation that task-24.3 (VoyageAI), task-24.4 (OpenAI), and task-24.5 (Ollama) all depend on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `ProviderConfig` shape is defined in `packages/types/src/embeddings.ts`: `{ provider: "local-onnx" | "voyageai" | "openai" | "ollama", model: string, dtype?: string, endpoint?: string, api_key_ref?: string }` (api_key_ref is a logical name, not the key itself)
- [ ] #2 Default provider remains `local-onnx` with model `jinaai/jina-embeddings-v2-base-code` and `dtype: q8` (matches task-24)
- [ ] #3 CLI configuration is read from `~/.config/code-charter/config.json` (via `env-paths`) and overridable by a per-repo `.code-charter/config.json`. CLI flags `--provider`, `--model`, `--endpoint` take precedence
- [ ] #4 VSCode reads from `workspace` and `globalState` `vscode.workspace.getConfiguration("code-charter.embedding")` with settings `provider`, `model`, `dtype`, `endpoint`
- [ ] #5 API keys are NEVER stored in plain config files. CLI reads them from the OS keychain via `keytar` (or equivalent), fallback to environment variables `VOYAGE_API_KEY`, `OPENAI_API_KEY`. VSCode uses `vscode.SecretStorage`
- [ ] #6 CLI commands `code-charter keys set <provider>` (interactive prompt, stores in keychain), `code-charter keys list`, `code-charter keys remove <provider>`
- [ ] #7 VSCode commands `Code Charter: Set <Provider> API Key`, `Code Charter: Clear <Provider> API Key`
- [ ] #8 A `ProviderRegistry` resolves config → concrete `EmbeddingProvider` instance. Unknown providers, missing keys, or invalid endpoints fail with structured errors before any clustering work begins
- [ ] #9 The cache slug from task-24 AC #10 is extended to `<provider>:<model_id_safe>@<dtype_or_default>` so vectors from different providers do not collide
- [ ] #10 When user switches provider mid-project, the run detects the slug change and emits the same "stranded cache" notice from task-24 AC #10
- [ ] #11 Telemetry summary line (task-24 AC #21) includes `provider` and `endpoint` (endpoint redacted for hosted APIs)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define `EmbeddingProvider` (already exists) + `ProviderConfig` types in `packages/types/src/embeddings.ts`; document the contract
2. Add `packages/cli/src/config.ts` for layered config (defaults → user → repo → flags)
3. Add `packages/cli/src/keys.ts` wrapping `keytar` with env-var fallback; add `code-charter keys` subcommands
4. Add `packages/vscode/src/config.ts` mirroring the layering against `workspace.getConfiguration` + `SecretStorage`
5. Add `ProviderRegistry` in `packages/cli/src/clustering/provider_registry.ts` returning a concrete provider for a given `ProviderConfig`. Initially only the `local-onnx` provider is registered; subsequent tasks add others
6. Wire `ClusteringService` construction to use the registry's resolved provider
7. Update cache slug computation to include provider; add migration notice
8. Tests: registry resolves correctly per config; missing key fails structured-error; provider switch surfaces stranded notice

## Out of scope

- Implementing the actual `VoyageAIEmbeddingProvider`, `OpenAIEmbeddingProvider`, `OllamaEmbeddingProvider` (their own subtasks)
- UI affordance for picking a provider visually (CLI command + VSCode settings suffices for v1)
- Multi-provider per-symbol routing (e.g. "use local for short functions, hosted for long"). One provider per run
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CLI package deleted. Drop the 'code-charter keys' CLI subcommands, .code-charter/config.json layering, and keytar. Keep VSCode SecretStorage + workspace.getConfiguration plumbing. Retarget ProviderRegistry to packages/vscode/src/clustering/provider_registry.ts.
<!-- SECTION:NOTES:END -->
