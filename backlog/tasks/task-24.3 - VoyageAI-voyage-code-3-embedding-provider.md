---
id: task-24.3
title: VoyageAI voyage-code-3 embedding provider
status: To Do
assignee: []
created_date: "2026-05-24"
labels: [clustering, embeddings, providers]
dependencies: [task-24, task-24.2]
parent_task_id: task-24
---

## Description

Add a `VoyageAIEmbeddingProvider` implementing `EmbeddingProvider` against the `voyage-code-3` model. Voyage's code-specialised model is a strong hosted alternative for users willing to trade local compute for higher-quality clusters and zero model-download.

## Acceptance Criteria

- [ ] `packages/cli/src/clustering/providers/voyageai_provider.ts` implements `EmbeddingProvider.get_embeddings(texts: string[]): Promise<number[][]>` calling `POST https://api.voyageai.com/v1/embeddings` with `{ input: texts, model: "voyage-code-3", input_type: "document" }`
- [ ] API key read via the key storage from task-24.2 (`VOYAGE_API_KEY` env var or keychain entry `code-charter:voyageai`)
- [ ] Provider registers with `ProviderRegistry` under id `voyageai`; default model `voyage-code-3`; embedding dim 1024 inferred from first response (not hardcoded)
- [ ] Batching: max 128 inputs per request OR 320,000 tokens per request, whichever is hit first; respect Voyage rate limits with exponential backoff on 429
- [ ] Errors: missing key → structured error before any request; 401/403 → "Invalid VoyageAI API key; run `code-charter keys set voyageai`"; 429 → retry with backoff up to 3 attempts then fail; 5xx → retry once then fail
- [ ] Cache slug becomes `voyageai:voyage-code-3` (no dtype since hosted). Switching from local-onnx triggers stranded-cache notice from task-24 AC #10
- [ ] No prompt for first-use of a hosted provider beyond the consent UX in task-24.1 (which already covers the "switch to another provider" flow)
- [ ] Integration test gated by `VOYAGE_API_KEY=...` env var: embeds a small fixture, asserts response shape + dim; CI skips when unset
- [ ] Unit tests with `fetch` mocked: batching boundary; retry on 429; structured error on 401

## Implementation Plan

1. Read Voyage API docs to confirm endpoint, request shape, rate limits, dimension
2. Implement provider class with `node-fetch` (or native `fetch` on Node 18+)
3. Register with `ProviderRegistry`
4. Add `__fixtures__/voyageai_sample_response.json` for mocked tests
5. Add integration test gated on env var
6. Document in `packages/cli/README.md` the env var name and the `code-charter keys set voyageai` command

## Out of scope

- Streaming embeddings
- Voyage's reranker API (different product)
- Cross-region endpoint selection
