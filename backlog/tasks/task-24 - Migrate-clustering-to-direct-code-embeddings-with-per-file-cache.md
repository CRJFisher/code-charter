---
id: TASK-24
title: Migrate clustering to direct code embeddings with per-file cache
status: To Do
assignee: []
created_date: "2026-05-24 12:00"
updated_date: "2026-05-24 12:00"
labels: [clustering, embeddings, performance]
dependencies: [task-15]
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The clustering pipeline currently embeds each function's **docstring** as the semantic representation. Modern code-embedding models encode the semantic intent of function source directly, removing a step that is both noisy (functions without docstrings get the function name as a substitute) and brittle (docstrings drift from code).

This task switches the embedding input from docstring text to the function's **source body**, swaps the embedding model to `jinaai/jina-embeddings-v2-base-code` (768-dim, 8192-token ALiBi context, trained on code), and replaces the whole-project MD5 embedding cache with a per-file content-addressed cache that invalidates one file at a time — mirroring the per-file invalidation pattern in `ariadne/packages/core/src/persistence/`.

Docstrings remain part of the UI surface (function-node descriptions, search) and the cluster-labeling heuristic. They are no longer fed into the embedding model.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The embedding provider uses `jinaai/jina-embeddings-v2-base-code` with `dtype: 'q8'`, mean pooling, L2 normalisation; produces 768-dim vectors
- [ ] #2 Tokenizer `model_max_length` is verified post-load to be 8192 and overridden if the loaded tokenizer config caps it lower
- [ ] #3 Embedding input for each `CallableNode` is the source slice covered by `definition.location` (start/end row+col from the file content), not the docstring text
- [ ] #4 Running `code-charter init` twice on an unchanged repo performs zero embedding-model invocations on the second run (verifiable via injected counting `EmbeddingProvider` in a Jest test)
- [ ] #5 Editing one function in a file with N functions causes exactly one new embedding-model invocation on next run (verifiable via the same counting provider)
- [ ] #6 A whitespace-only edit above functions in a file (which shifts ariadne `SymbolId` row/col for functions below) produces zero new embedding-model invocations, because lookup is content-addressed by `code_hash` of the function body, not by `symbol_id`
- [ ] #7 Renaming or moving a function across files preserves its embedding entry (content-addressed reuse)
- [ ] #8 Deleting a function from a file evicts its entry from the per-file shard on next run, and a final GC step deletes any orphan vectors not referenced by any current shard
- [ ] #9 The cluster cache key is built from the call-graph topology over `code_hash` endpoints (not over `symbol_id`), so clusters do not rebuild when only whitespace/row positions change, and DO rebuild when call edges change even if no body bodies do
- [ ] #10 Cache directory layout is namespaced by `<embedding_model_id>@<dtype>` so swapping models leaves prior caches intact
- [ ] #11 A top-level `.code-charter/schema_version` file gates the layout; on mismatch the entire `.code-charter/embeddings/`, `.code-charter/clusters/`, and `.code-charter/manifest.json` are removed on next run with a user-visible log line (stderr in CLI, VSCode output channel for the extension). `cluster-summaries.json` at the repo root is NOT touched by schema bumps
- [ ] #12 No duplicate `clustering_service.ts` or `local_embeddings_provider.ts` exists across `packages/cli` and `packages/vscode`; both packages import from a single source-of-truth location
- [ ] #13 The committed `cluster-summaries.json` wire format is unchanged by this task (label/description/members/deps shape preserved). Heuristic summarizer continues to label clusters from docstring tokens, falling back to function-name tokens when a function has no docstring
- [ ] #14 UI function-node `description` text and search-panel scoring still receive docstrings via `DocstringSummaries` / `get_code_tree_descriptions` — the wire contract between backend and UI is unchanged
- [ ] #15 First-run model download (~160 MB q8) is lazy (model cached under `TRANSFORMERS_CACHE`, not bundled in the .vsix) and reports progress through the existing `progress_callback` (CLI stderr percentage; VSCode progress notification)
- [ ] #16 `code-charter init` gains a `--clear-cache` flag that deletes `.code-charter/embeddings/`, `.code-charter/clusters/`, and `.code-charter/manifest.json` before running

<!-- AC:END -->

## Implementation Plan

### Phase 1 — Dedup the clustering / embedding modules (atomic refactor, no behaviour change)

Move shared files to one source-of-truth location and have the other package import them. Smallest viable change: keep them in `packages/cli/src/clustering/` (new sub-directory) and have `packages/vscode/src/clustering/clustering_service.ts` re-export from there. Defer extracting a new workspace package — YAGNI.

Files affected:
- `packages/cli/src/clustering_service.ts` → `packages/cli/src/clustering/service.ts`
- `packages/cli/src/local_embeddings_provider.ts` → `packages/cli/src/clustering/local_embeddings_provider.ts`
- `packages/cli/src/content_hash.ts` → `packages/cli/src/clustering/content_hash.ts`
- Delete `packages/vscode/src/clustering/clustering_service.ts`, `packages/vscode/src/clustering/local_embeddings_provider.ts`, `packages/vscode/src/storage/content_hash.ts`; import from `@code-charter/cli` (or via relative path if cross-package import is awkward — assess during phase).

Verify: existing tests pass; `code-charter init` produces byte-equal output before/after on a fixture project.

### Phase 2 — New cache schema with per-file shards (still MiniLM, still docstrings)

Implement the per-file content-addressed cache. Keep MiniLM and docstring input unchanged at this point — purpose of this phase is to validate the schema independently from the model and input changes.

Cache layout:
```
.code-charter/
  schema_version                              # plain integer file
  manifest.json                               # { schema_version, embedding_model_slug,
                                              #   files: { [file_path]: { file_content_hash, symbols: { [symbol_id]: { code_hash } } } } }
  embeddings/<embedding_model_slug>/
    shards/<encoded_file_path>.json           # { vectors: { [code_hash]: number[] } }   -- inline vectors, content-addressed within file
  clusters/<topology_digest>.json             # string[][]
```

- `<embedding_model_slug>` = `<model_id_safe>@<dtype>` (e.g. `xenova-all-minilm-l6-v2@fp32`, later `jinaai-jina-embeddings-v2-base-code@q8`).
- `<encoded_file_path>` = a reversible URL-encoded form of the workspace-relative path (debuggability — not a SHA hash).
- `<topology_digest>` = SHA-256 of the call-graph: sorted unique `code_hash` set followed by sorted edge multiset `(caller_code_hash, callee_code_hash)`. Whitespace-only edits do not change it; topology changes do.

Invalidation flow (mirrors ariadne `load_project`):
1. For each file: read content, compute `file_content_hash`.
2. Look up `manifest.files[path]`. If `file_content_hash` matches: load the existing shard, every symbol's vector lookup will hit by `code_hash`.
3. Miss path: re-derive `CallableNode`s for the file from ariadne, compute each symbol's `code_hash` from the source slice, look each up in the existing shard's `vectors` map — hits skip embedding; misses go into the embedding batch.
4. After batch embedding, write the new shard (only the `vectors` referenced by current symbols), update the manifest entry.
5. Reconcile manifest keys against the current file set: drop entries for files no longer present.
6. After all shards are written, run a final GC pass: each shard already only retains referenced `code_hash` vectors, so no separate orphan-store cleanup is needed (the design avoids an unbounded `by_content/` store on purpose).

Concurrency note (VSCode only): snapshot the manifest and shards into memory at clustering start; defer file-change events to a queue that is drained after the current clustering call completes.

Test: introduce a `CountingEmbeddingProvider` test double; assert call counts for the AC scenarios on a Jest fixture under `packages/cli/__tests__/fixtures/`.

### Phase 3 — Switch embedding input + model in one atomic change

These cannot be staged independently: MiniLM has a 512-token context and will misrepresent multi-line function bodies, masking real bugs. Jina's 8192-token ALiBi context is the prerequisite for using function-body input.

In the shared `local_embeddings_provider.ts`:
- Set `MODEL_ID = "jinaai/jina-embeddings-v2-base-code"`.
- Add `{ dtype: 'q8' }` to the `pipeline()` call. Fix the `load_feature_extractor` type cast to accept `PretrainedOptions`.
- After load, read `pipeline.tokenizer.model_max_length`; if < 8192, set it to 8192 (the ALiBi-based model supports it even when the tokenizer config caps lower).
- Keep mean pooling + L2 normalize.
- Drop the default batch size from 32 to 16 (q8 BERT-base at 8K context is heavier than MiniLM at 512); revisit if profiling shows headroom.

In the caller (`clustering_service`):
- Replace `get_docstring(node.definition)` with `extract_source_slice(file_content, node.definition.location)` for the embedding input.
- Keep `get_docstring()` calls in place for the `DocstringSummaries` wire (the UI's description text) and for `heuristic_summarizer` (cluster labels).
- Update `embedding_model_slug` to `jinaai-jina-embeddings-v2-base-code@q8` — this re-namespaces the cache, so prior MiniLM vectors stay on disk under their own slug and the new run starts cold.

Verify the published model has the ONNX export with the q8 variant (`model_quantized.onnx`) before committing the model id — verified at the time of writing: `https://huggingface.co/jinaai/jina-embeddings-v2-base-code/tree/main/onnx`.

### Phase 4 — UI loading copy and CLI flag

- `packages/ui/src/components/code_chart_area/code_chart_area.tsx:322` — change "Extracting docstrings from source code..." to a model-agnostic phrase.
- Add `--clear-cache` flag to `code-charter init` (CLI). Wires through to manifest/shard/cluster deletion.
- VSCode: log a single line to the extension's output channel on schema-version mismatch describing what was cleared.

### Phase 5 — Docs

Update `backlog/docs/` with a description of the new cache layout, the model, and the per-file invalidation flow. Update READMEs in `packages/cli` and `packages/vscode` to mention the model download size (~160 MB) and the cache location.

## Phased Acceptance (each phase is independently shippable)

| Phase | Ships when |
|---|---|
| 1 | Existing tests pass; fixture project produces byte-equal cluster output |
| 2 | AC #4, #5, #6, #7, #8, #11 pass with MiniLM still in place; AC #9, #10 schema in place |
| 3 | AC #1, #2, #3 pass; AC #9, #10 verified end-to-end with jina |
| 4 | AC #15, #16 pass |
| 5 | Docs updated |

## Risks and decision gates

- **Model availability gate (before Phase 3)**: confirm `jinaai/jina-embeddings-v2-base-code/onnx/model_quantized.onnx` is reachable and that `@huggingface/transformers@3.7.1` loads it without errors on Node 18 (CLI) and the VSCode extension host. If broken, halt Phase 3 and re-evaluate.
- **Tokenizer cap surprise**: if post-load probing shows `model_max_length: 512` and we cannot override it, we lose the 8192 advantage; functions are then silently truncated as today, just under a different model. Document the cap in logs and proceed — Jina's code training still likely beats MiniLM at 512.
- **`definition.location` reliability**: this is the canonical ariadne field for the symbol's full range (start_row/col → end_row/col). If a particular language adapter populates it inaccurately, the extracted source slice will be wrong; add a unit test per supported language (TS, JS, Python at minimum) that asserts the slice equals the expected function body.
- **VSCode .vsix bundling**: the model is lazy-downloaded so it is not in the bundle. The existing unbundled `node_modules/` ship (no esbuild step) is unchanged by this task — esbuild bundling is a separate follow-up.
- **q8 quantization determinism across platforms**: cluster ordering depends on similarity ranks. Acceptance for cluster output uses a tolerance-based snapshot rather than byte-equality post-Phase 3.

## Dependencies

- **task-15** (RegexDocstringProvider removal) must land first — currently in flight in the working tree.
- Supersedes the "per-function embedding cache" bullet inside **task-12** Phase 3; the rest of task-12 (clustering-tfjs upgrade, SOM, adapter, settings UI) is orthogonal.
- Independent of **task-23** (module position preservation); the two compose well — cheap per-file re-embedding plus position alignment yields a smooth re-clustering UX.
- Independent of **task-21** (doc-code dependency graph).

## Out of scope

- Extracting a new `@code-charter/clustering` workspace package (Phase 1 stays in `packages/cli/src/clustering/`).
- LLM-generated cluster labels (task-7 family).
- Bundling the VSCode extension with esbuild.
- Cross-file content-addressed dedup of identical function bodies (`by_content/` store) — speculative; not justified by current workloads.
- Auto-rerun of clustering on file change in VSCode — preserved as user-triggered, same as today.
