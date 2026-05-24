---
id: task-24.4
title: OpenAI text-embedding-3 embedding provider
status: To Do
assignee: []
created_date: "2026-05-24"
labels: [clustering, embeddings, providers]
dependencies: [task-24, task-24.2]
parent_task_id: task-24
---

## Description

Add an `OpenAIEmbeddingProvider` implementing `EmbeddingProvider` against `text-embedding-3-small` and `text-embedding-3-large`. OpenAI's embeddings are not code-specialised but are ubiquitous, well-known to users, and a reasonable fallback when neither local compute nor a VoyageAI key is available.

## Acceptance Criteria

- [ ] `packages/cli/src/clustering/providers/openai_provider.ts` implements `EmbeddingProvider.get_embeddings(texts: string[]): Promise<number[][]>` calling `POST https://api.openai.com/v1/embeddings`
- [ ] Default model `text-embedding-3-small` (1536-dim). User may override to `text-embedding-3-large` (3072-dim) via the config from task-24.2
- [ ] Optional `dimensions` parameter passed through when the user configures a non-default dim (text-embedding-3 supports dimension truncation natively)
- [ ] API key from `OPENAI_API_KEY` env var or keychain entry `code-charter:openai` (task-24.2)
- [ ] Provider registers with `ProviderRegistry` under id `openai`; embedding dim inferred from the first response
- [ ] Custom base URL via config (`endpoint` field from task-24.2) to support OpenAI-compatible proxies (Azure OpenAI, LiteLLM)
- [ ] Batching: max 2048 inputs OR 300,000 tokens per request; backoff on 429 (exponential, max 3 retries); fail on 401/403 with structured error guiding to `code-charter keys set openai`
- [ ] Cache slug `openai:text-embedding-3-small` or `openai:text-embedding-3-large@<dim>` when dimension is overridden
- [ ] Integration test gated by `OPENAI_API_KEY=...` env var; unit tests with mocked fetch covering batching, 429 retry, dimension override

## Implementation Plan

1. Confirm latest OpenAI embeddings API docs (batching limits, dimensions parameter, rate limits)
2. Implement provider class
3. Register with `ProviderRegistry`
4. Add fixture response + unit tests + gated integration test
5. Document in `packages/cli/README.md`

## Out of scope

- Other OpenAI models (`text-embedding-ada-002` is legacy; not adding it)
- Function-calling, vision, completion endpoints (out of scope for an embeddings provider)
- Azure OpenAI authentication beyond `endpoint` override + bearer key (Azure-AD auth is a follow-up)
