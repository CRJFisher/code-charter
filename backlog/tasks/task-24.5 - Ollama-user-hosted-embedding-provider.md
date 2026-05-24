---
id: TASK-24.5
title: Ollama (user-hosted) embedding provider
status: To Do
assignee: []
created_date: '2026-05-24'
updated_date: '2026-05-24 14:10'
labels:
  - clustering
  - embeddings
  - providers
dependencies:
  - task-24
  - task-24.2
parent_task_id: TASK-24
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an `OllamaEmbeddingProvider` implementing `EmbeddingProvider` against a user-hosted Ollama endpoint. This lets users run any embedding model Ollama supports (`nomic-embed-text`, `mxbai-embed-large`, custom GGUFs) on their own hardware via a simple HTTP API. Useful for users who want privacy + a different model than the local-ONNX default without leaving the machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `packages/cli/src/clustering/providers/ollama_provider.ts` implements `EmbeddingProvider.get_embeddings(texts: string[]): Promise<number[][]>` calling `POST <endpoint>/api/embeddings` with `{ model, prompt }` per text (Ollama's embeddings endpoint is single-input; provider loops with parallelism cap)
- [ ] #2 Provider registers under id `ollama`. Required config: `endpoint` (default `http://localhost:11434`), `model` (no default — user must specify, since Ollama models are user-installed). Missing `model` → structured error guiding the user to `ollama pull <model>` and how to set the config
- [ ] #3 Connection failure (ECONNREFUSED, ETIMEDOUT) → structured error: "Ollama not reachable at <endpoint>. Is `ollama serve` running?"
- [ ] #4 404 on the model name → structured error: "Model <name> is not installed. Run `ollama pull <name>`."
- [ ] #5 No API key needed. `api_key_ref` in config is ignored for this provider
- [ ] #6 Parallelism: configurable concurrency (default 4) to avoid swamping the local server while still beating one-at-a-time latency
- [ ] #7 Embedding dim inferred from first response. Cache slug `ollama:<model_safe>@<endpoint_host>` so different Ollama instances or models do not collide
- [ ] #8 Optional health check on first use: `GET <endpoint>/api/tags` to verify the server is up and the model is installed before sending any embedding requests
- [ ] #9 Unit tests with mocked fetch covering: endpoint unreachable; model missing; happy path with batched parallelism
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm Ollama embeddings API contract (`/api/embeddings`, single-prompt input; check if newer versions support batch input)
2. Implement provider with a parallelism-limited mapper over `texts`
3. Register with `ProviderRegistry`
4. Add fixture response + unit tests
5. Document in `packages/cli/README.md` with the `ollama pull` workflow

## Out of scope

- Auto-starting `ollama serve` if not running
- Auto-pulling missing models
- mTLS / authenticated Ollama deployments (the endpoint config is enough for v1)
- Streaming
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Retarget implementation path from packages/cli/src/clustering/providers/ollama_provider.ts to packages/vscode/src/clustering/providers/ollama_provider.ts. Note: duplicate task-9.2 has been archived, so 24.5 is the single source for Ollama embeddings.
<!-- SECTION:NOTES:END -->
