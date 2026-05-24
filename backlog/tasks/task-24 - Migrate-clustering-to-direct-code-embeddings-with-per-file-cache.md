---
id: TASK-24
title: Migrate clustering to direct code embeddings with per-file cache
status: To Do
assignee: []
created_date: "2026-05-24 12:00"
updated_date: "2026-05-24 13:00"
labels: [clustering, embeddings, performance]
dependencies: [task-14.1, task-14.3, task-15]
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

The clustering pipeline currently embeds each function's **docstring** as the semantic representation. Switch the embedding input to the function's **source body**, swap the embedding model to `jinaai/jina-embeddings-v2-base-code` (768-dim, ALiBi context up to 8192 tokens, trained on code), and replace the whole-project MD5 embedding cache with a per-file content-addressed cache that invalidates one file at a time — mirroring the per-file invalidation pattern in `ariadne/packages/core/src/persistence/`.

The claim that code embeddings cluster better than ariadne-extracted docstrings on this codebase's call-graph workloads is **not yet validated**. The plan therefore gates Phase 3 (the model swap) on a labelled-fixture quality benchmark; if jina-on-bodies does not beat MiniLM-on-docstrings on the benchmark, Phase 3 does not ship and the upstream change is rejected with a written record.

Docstrings remain part of the UI surface (function-node descriptions, search) and the cluster-labelling heuristic. They are no longer fed into the embedding model.

<!-- SECTION:DESCRIPTION:END -->

## Decisions recorded inline (no separate ADR needed)

- **Embedding input** = the source byte range covered by `definition.location` (start_line/col → end_line/col from `@ariadnejs/types`). This carries the signature and the body. `body_scope_id` (body-only) is rejected because the signature carries semantic information about parameters and return types that the model should see.
- **`code_hash`** = `sha256(file_content.slice(byte_offset(start), byte_offset(end)).replace(/\r\n/g, "\n").trimEnd())`. No comment stripping (would require per-language parsing — YAGNI). No leading-whitespace strip (indentation is semantic in Python). CRLF→LF normalisation and rstrip only. Body-internal edits (including comment edits inside the function) re-embed; only edits outside any function range are free.
- **Cache layout key** = single `<embedding_model_id>@<dtype>` slug in the path. The earlier draft's separate `schema_version` file is dropped — the slug already namespaces layout changes, so a future schema change is a new slug, not a file-based gate. (Picks one mechanism, not two; constitution-aligned.)
- **Stranded prior-slug caches** are NOT auto-deleted; the new `--clear-cache` flag is the user-facing remedy and the run emits a one-line notice when it detects a non-active slug on disk.
- **No legacy-model switch**. Constitution rejects backwards-compatibility shims. Rollback path is `git revert` plus `--clear-cache`; the per-slug namespacing means the old MiniLM cache on disk remains valid on revert with no migration step.
- **Callable kinds embedded**: `function` and `method` only. Classes are excluded from the cosine-similarity step (their bodies are stub sequences, not comparable distributions); they remain nodes in the call graph and participate via adjacency. Arrow functions and closures are embedded as functions if ariadne surfaces them as `CallableNode`.
- **Cluster cache scope**: the `topology_digest` is keyed over the **subgraph being clustered** (rooted at an entry-point in the VSCode flow, or the full graph in the CLI). Different entry-points produce different digests even when subtrees overlap.
- **Alternatives considered for the embedding model**: `Salesforce/SFR-Embedding-Code` (stronger but larger, license restrictive), `nomic-ai/nomic-embed-code` (Apache 2.0, comparable tier), hybrid BM25+dense (more pipeline). Jina v2 base-code is the Pareto choice for offline-local: Apache 2.0, 161M params with q8 at ~160 MB, ALiBi enables long contexts, established ONNX export.
- **Model download lifecycle for v1**: auto-download on first use, no prompt, no API-key alternative. The user request explicitly accepts the trade-off: v1 prioritises zero-config; ergonomics (consent prompt, hosted-API option, upgrade-rebuild policy) are deferred. The `EmbeddingProvider` interface (`get_embeddings(texts: string[]): Promise<number[][]>`) is the seam for future providers — local-onnx, voyage-code-3 (API), OpenAI text-embedding-3, etc. — without changing the clustering layer.

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 The embedding provider uses `jinaai/jina-embeddings-v2-base-code` with `dtype: 'q8'`, mean pooling, L2 normalisation; produces 768-dim vectors. The official repo's `onnx/model_quantized.onnx` is the loaded artefact
- [ ] #2 An end-to-end probe with a ~8000-token input passed through the pipeline produces an output tensor of shape `[1, ≥8000, 768]` without truncation (not just that `tokenizer.model_max_length` reads back 8192)
- [ ] #3 Embedding input for each `CallableNode` is the source slice from `definition.location`. A per-language test fixture (TypeScript, JavaScript, Python) asserts the extracted slice equals the expected function body byte-for-byte
- [ ] #4 Running `code-charter init` twice on an unchanged repo performs zero embedding-model invocations on the second run. When the manifest indicates zero misses, the embedding pipeline is not even constructed (no model load). Verified via injected `CountingEmbeddingProvider` and a pipeline-construction spy
- [ ] #5 Editing one function in a file with N functions causes exactly one new embedding-model invocation on the next run (committed fixture variant `sample_project_v4_edit`)
- [ ] #6 A whitespace-only edit *outside* any function range produces zero new embedding-model invocations, because lookup is content-addressed by `code_hash` of the function body, not by `symbol_id`. A precondition assert in the test confirms ariadne `SymbolId` row/col actually shifts between the two fixture variants
- [ ] #7 Renaming a file or moving a function across files preserves its embedding entry. The implementation does a **two-pass write per run**: (1) compute the new manifest (file → symbol → code_hash) entirely, (2) for any `code_hash` newly referenced by some file, search prior shards and migrate the vector before rewriting any shard. Verified by a `sample_project_v3_rename` fixture asserting zero new embeddings after a function move
- [ ] #8 Deleting a function from a file evicts its entry from that file's shard on next run. There is no orphan store: each shard contains only the `code_hash` vectors referenced by the current symbol set in that file. Verified by reading the shard JSON after a deletion-run fixture
- [ ] #9 The cluster cache digest (a) keys graph **nodes** by `symbol_id` (not `code_hash`, to avoid collapsing two distinct functions with identical bodies), (b) keys graph **edges** as sorted pairs `(min(symbol_id), max(symbol_id))` to match the symmetric adjacency matrix at `clustering_service.ts:202-204`, (c) includes the clustering subgraph's entry-point `symbol_id`, and (d) preserves recursive self-edges. Two pure unit tests: (9a) whitespace-edit row-shift produces the same digest when `code_hash` set is preserved AND `symbol_id` set is normalised by sorted code-hash order; (9b) adding or removing an edge changes the digest
- [ ] #10 Cache directory is namespaced as `embeddings/<model_id_safe>@<dtype>/` so swapping models leaves prior caches intact. On a run that detects non-active slug directories on disk, a single one-line notice prints to stderr (CLI) and to the VSCode output channel: `Stranded cache at <slug> (<bytes>). Run with --clear-cache to remove.`
- [ ] #11 `code-charter init` gains a `--clear-cache` flag that removes `.code-charter/embeddings/`, `.code-charter/clusters/`, and `.code-charter/manifest.json`. It does NOT touch the committed `cluster-summaries.json` at the repo root
- [ ] #12 No duplicate `clustering_service.ts` or `local_embeddings_provider.ts` exists across `packages/cli` and `packages/vscode`. Verified by a static check (find duplicates by basename in source globs)
- [ ] #13 Committed `cluster-summaries.json` schema is **extended** (not invariant) with provenance fields: `embedding_model_slug`, `dtype`, `input_kind: "function_body"`, and a `label_provenance` enum per cluster entry (`"docstring" | "name_tokens"`). The wire JSON schema is committed at `packages/types/src/__fixtures__/cluster_summaries.schema.json` and a schema test guards regressions
- [ ] #14 UI function-node `description` text and search-panel scoring still receive docstrings via `DocstringSummaries` / `get_code_tree_descriptions`. The backend ↔ UI wire contract for descriptions is unchanged; the new `label_provenance` field is added to the `NodeGroup` shape and rendered with a subdued style in the chart when `"name_tokens"`
- [ ] #15 First-run model download is lazy (under `TRANSFORMERS_CACHE`, not bundled in `node_modules` for distribution). It surfaces a cancellable progress UX: percentage line on CLI stderr; `vscode.window.withProgress({ location: Notification, cancellable: true })` in the extension, where cancellation aborts the download cleanly with no half-written model file
- [ ] #16 A precondition preflight runs before any model load: `HEAD https://huggingface.co/jinaai/jina-embeddings-v2-base-code/resolve/main/onnx/model_quantized.onnx` with a 5 s timeout. On failure, exit with a structured error containing the URL and `HTTPS_PROXY` configuration guidance, before triggering `pipeline()`
- [ ] #17 Concurrent `code-charter init` invocations on the same repo are serialised by an advisory lockfile (`.code-charter/.lock` via O_EXCL). The second invocation exits non-zero within 1 second with `another instance in progress`
- [ ] #18 Per-file shards are written atomically (`write_to_tmp → rename`) reusing or mirroring the helper at `ariadne/packages/core/src/persistence/file_system_storage.ts`. Shards are flushed per-file as embeddings complete, so a crash after embedding N of M files leaves the N completed shards plus a consistent manifest entry for each; the next run embeds only M-N
- [ ] #19 In VSCode, the clustering service holds `active_run: Promise<void> | null` and `pending_files: Set<FilePath>`. File-change events received while a run is in flight are queued; on run completion the queue drains in a single batch. The manifest snapshot taken at run start is a by-value `Map` copy
- [ ] #20 A corrupt or truncated shard file is detected, logged once, and regenerated; clustering completes successfully (a unit test installs a malformed shard then asserts the run recovers)
- [ ] #21 At the end of each run, a structured summary line is emitted (CLI stderr; VSCode output channel) containing: `model_id`, `dtype`, `tokenizer.model_max_length` actually used, total `embedding_calls`, per-file `(hits, misses)` aggregated counts, total wall-time broken into `parse|embed|cluster|summarize`, and the `topology_digest`
- [ ] #22 **Quality benchmark gate (Phase 3 precondition)**: against a committed labelled fixture (50–100 functions across at least three modules with hand-assigned ground-truth roles), jina-on-bodies must achieve an Adjusted Rand Index (ARI) against ground truth that is **≥** the ARI achieved by MiniLM-on-docstrings on the same fixture. The script that computes this is checked in and runnable as `npm run bench-clustering` in the CLI package. Phase 3 does not merge if this AC fails; the team writes a short rejection note instead
- [ ] #23 **Q8 cross-platform tolerance**: on the committed fixture, cluster membership Jaccard between Linux-x64 and macOS-ARM runs is ≥ 0.95. Asserted in an integration test runnable on both platforms (CI may run one platform; the other is verified on a developer machine pre-merge)
- [ ] #24 Cold-run on a 1000-function synthetic fixture completes under `NODE_OPTIONS=--max-old-space-size=2048` (i.e. < 2 GB peak heap)
- [ ] #25 Stability of clustering output: three repeated runs against the committed labelled fixture produce cluster partitions with pairwise ARI ≥ 0.9 (clustering should not be wildly non-deterministic across runs)

<!-- AC:END -->

## Implementation Plan

### Phase 0 — Preflight and test infrastructure

Set up the prerequisites before writing any pipeline code:

- Add `packages/cli/jest.config.js` (CLI has no Jest config today).
- Add `packages/cli/src/clustering/counting_embedding_provider.ts`: implements `EmbeddingProvider`, deterministic hash-to-vector for repeatability, exposes `call_count` and `last_inputs`.
- Commit fixture variants under `packages/cli/src/clustering/__fixtures__/sample_project/`:
  - Base: ~15 functions across TS, JS, Python in 3 modules with realistic dependencies; one undocumented function; one > 512-token function.
  - `_v2_whitespace`: blank lines inserted outside function ranges.
  - `_v3_rename`: one function moved from A to B with body unchanged.
  - `_v4_edit`: one function body changed; rest unchanged.
- Commit `packages/cli/src/clustering/__fixtures__/golden_clusters.json` (ground-truth labels).
- Commit `packages/types/src/__fixtures__/cluster_summaries.schema.json`.
- Add `packages/cli/scripts/bench_clustering.ts` runnable via `npm run bench-clustering` that computes ARI for both (MiniLM, docstrings) and (jina, bodies) against `golden_clusters.json`.

This phase is purely test infrastructure; behaviour unchanged.

### Phase 1 — Dedup the clustering / embedding modules

Move shared files to `packages/cli/src/clustering/` and have the VSCode extension import from there. Defer extracting a new workspace package — YAGNI.

- `packages/cli/src/clustering_service.ts` → `packages/cli/src/clustering/service.ts`
- `packages/cli/src/local_embeddings_provider.ts` → `packages/cli/src/clustering/local_embeddings_provider.ts`
- `packages/cli/src/content_hash.ts` → `packages/cli/src/clustering/content_hash.ts`
- Delete the VSCode duplicates; import from `@code-charter/cli` (or relative if the cross-package import is awkward in this monorepo — assess during phase).
- Note: task-14.3 (clustering decoupling) overlaps this; either close 14.3 as superseded by 24-Phase-1 or collapse the work — whichever lands first wins.

Verify: existing tests pass; fixture project produces ARI ≥ 0.95 cluster partition against the same code's pre-refactor run (not byte-equality — spectral clustering with k-means init inside the eigenvector projection is not byte-stable across runs).

### Phase 2 — Per-file content-addressed cache with MiniLM still in place

Implement the new schema and invalidation flow against the current MiniLM + docstring pipeline so we can validate the schema independently from the model swap. AC #4–#12, #17–#21 land here.

Layout:
```
.code-charter/
  .lock                                          # O_EXCL advisory lock
  manifest.json                                  # { embedding_model_slug, files: { [path]: { file_content_hash, symbols: { [symbol_id]: { code_hash } } } } }
  embeddings/<embedding_model_slug>/
    shards/<urlencoded_file_path>.json           # { vectors: { [code_hash]: number[] } }
  clusters/<topology_digest>.json                # string[][]
```

Invalidation flow:
1. Acquire `.lock` (O_EXCL). On failure, exit 1.
2. For each file: read content, compute `file_content_hash`.
3. **Pass 1** — derive the new manifest in memory: for each file compute symbols and their `code_hash` from `definition.location` slices.
4. **Pass 2** — for any `code_hash` newly referenced by file F that does not exist in F's prior shard, search prior shards (across all files) for the vector and migrate it before rewriting any shard. This satisfies AC #7 without needing a separate `by_content/` store.
5. Compute the union of `code_hash`es still needing embeddings → batch through provider.
6. Write each shard atomically (temp + rename) per-file as its embeddings complete (AC #18).
7. Reconcile manifest keys: drop entries for files no longer present.
8. Compute `topology_digest` per AC #9; check `clusters/<topology_digest>.json` → cluster cache hit/miss.
9. Release lock.

VSCode concurrency: per AC #19 — `active_run: Promise | null`, `pending_files: Set<FilePath>` owned by the clustering service; events during a run are queued and drained in a single batch on completion.

### Phase 3 — Switch embedding input + model (atomic) — gated on benchmark

Atomic change because MiniLM at 512 tokens would silently misrepresent function bodies, masking real evaluation.

- Before this phase merges, AC #22 must pass: `npm run bench-clustering` shows jina-on-bodies ARI ≥ MiniLM-on-docstrings ARI against `golden_clusters.json`. If it fails, write a short note in `backlog/decisions/` recording the negative result and close the phase as rejected.
- Change `MODEL_ID` and `dtype` per AC #1. Update `embedding_model_slug` to `jinaai-jina-embeddings-v2-base-code@q8`.
- Replace `get_docstring(node.definition)` with `extract_source_slice(file_content, node.definition.location)` for the embedding input. Keep `get_docstring()` calls for `DocstringSummaries` (UI) and for `heuristic_summarizer` (cluster labels).
- After load: probe `pipeline.tokenizer.model_max_length`; if < 8192, mutate to 8192; verify by running a real ~8000-token input through the pipeline and asserting output shape (AC #2).
- Add preflight HEAD check (AC #16).
- Drop default batch size from 32 to 16 (q8 BERT-base at long contexts is heavier than MiniLM).
- Stratify by callable kind: classes are excluded from the embedded set per the Decisions section; they still participate via adjacency.

### Phase 4 — UI copy, CLI flag, telemetry summary

- Update `packages/ui/src/components/code_chart_area/code_chart_area.tsx:322` from "Extracting docstrings from source code..." to model-agnostic copy.
- Add `--clear-cache` (AC #11).
- Emit the structured summary line at run end (AC #21).
- Add the `label_provenance` field to `ClusterSummaryEntry` + `NodeGroup`; render `"name_tokens"` labels with a subdued style in the chart (AC #14).
- Add the stranded-slug notice (AC #10).

### Phase 5 — Docs

Update `backlog/docs/` and the per-package READMEs with the new cache layout, the model id and dtype, the ~160 MB first-run download, and a section on how to run the benchmark.

## Phased Acceptance

| Phase | Ships when |
|---|---|
| 0 | Jest config + fixtures + bench script committed; bench script runs against MiniLM baseline |
| 1 | Existing tests pass; fixture ARI ≥ 0.95 against pre-refactor partition |
| 2 | AC #4, #5, #6, #7, #8, #10, #11, #12, #17, #18, #19, #20 pass (with MiniLM still in place) |
| 3 | AC #22 gate passes; then AC #1, #2, #3, #9, #16, #23, #24, #25 pass end-to-end with jina |
| 4 | AC #13, #14, #15, #21 pass |
| 5 | Docs published |

## Risks and decision gates

- **Quality benchmark fails (AC #22)**: jina-on-bodies is no better than MiniLM-on-docstrings. Decision: do not ship Phase 3; record the negative result in `backlog/decisions/`; preserve Phases 0–2 (the cache rewrite is independently valuable). The repo retains MiniLM-on-docstrings with the new per-file cache.
- **Tokenizer override does not take effect**: AC #2 fails. Decision: log WARN with actual `model_max_length`, ship anyway with the lower cap, document in summary line. Jina's code training likely still beats MiniLM at the lower cap.
- **HF Hub unreachable in user environment**: preflight (AC #16) prints structured error and exits; user configures `HTTPS_PROXY` or sets `HF_HUB_OFFLINE=1` with a pre-staged cache directory. This is acknowledged as a known limitation, not solved by this task.
- **Cross-platform q8 drift exceeds tolerance (AC #23)**: Decision: pin a specific `onnxruntime-node` version in `package.json` and re-test. If still failing, increase tolerance (Jaccard 0.95 → 0.9) and document in the AC.
- **`definition.location` returns signature-only on some language**: ariadne-side bug. Decision: file an upstream issue, fall back to `body_scope_id` for that language, document the divergence.
- **VSCode marketplace bundling**: the current extension ships `node_modules/` unbundled. `@huggingface/transformers` (~441 MB) and `@tensorflow/tfjs-node` (~726 MB) together far exceed the marketplace's 50 MB .vsix cap. This task does NOT solve that — bundling via esbuild is a separate follow-up task. The "lazy-download" claim refers only to the model file, not the runtime libraries.

## Test infrastructure (lives next to its tests per repo convention)

- `packages/cli/src/clustering/counting_embedding_provider.ts` — test double.
- `packages/cli/src/clustering/__fixtures__/sample_project*/` — variant fixtures (base, _v2_whitespace, _v3_rename, _v4_edit) covering TS, JS, Python.
- `packages/cli/src/clustering/__fixtures__/golden_clusters.json` — ground-truth labels.
- `packages/cli/src/clustering/topology_digest.test.ts` — pure unit tests for AC #9.
- `packages/cli/src/clustering/cache_invalidation.test.ts` — covers AC #4–#8, #11, #17, #18, #20.
- `packages/cli/src/clustering/source_slice.test.ts` — covers AC #3 across TS/JS/Python.
- `packages/cli/src/clustering/local_embeddings_provider.integration.test.ts` — gated by `RUN_MODEL_TESTS=1`; covers AC #1, #2, #15.
- `packages/cli/scripts/bench_clustering.ts` + `npm run bench-clustering` — AC #22.
- `packages/types/src/__fixtures__/cluster_summaries.schema.json` — schema fixture for AC #13.

## Dependencies

- **task-14.1** (broken tests + dead code) is a hard prerequisite — Phase 0 cannot stand up Jest cleanly with the current red tests.
- **task-14.3** (clustering decoupled from VS Code APIs) — overlaps Phase 1; close 14.3 as superseded by this task's Phase 1 OR fold 14.3's scope here. Pick one to avoid duplicated effort.
- **task-15** (RegexDocstringProvider removal) must land first — currently uncommitted in the working tree.
- Supersedes the "per-function embedding cache" bullet inside **task-12** Phase 3; the rest of task-12 (clustering-tfjs upgrade, SOM, settings UI) is orthogonal.
- Independent of **task-23** (module position preservation); they compose.

## Out of scope

- Extracting a new `@code-charter/clustering` workspace package.
- LLM-generated cluster labels (task-7 family).
- Bundling the VSCode extension with esbuild for the marketplace — separate task; not solved by lazy model download.
- Cross-file content-addressed `by_content/` dedup store — the two-pass migration in Phase 2 step 4 achieves the same outcome without an unbounded object store.
- Auto-rerun of clustering on file change — preserved as user-triggered.
- A runtime `--model` selector or feature flag for legacy MiniLM — constitution rejects shims; rollback is `git revert`.
- Hybrid code+docstring embeddings — speculative; revisit if AC #22 fails.
- Air-gapped / private-mirror model distribution.
- A `--prune-stale-models` flag — `--clear-cache` covers the user-facing remedy; finer-grained pruning is a follow-up.
- Persisting `last_run.log` to disk — AC #21's stderr summary line is sufficient for now.
- Daemon mode / long-lived CLI process to avoid repeated model loads.
- **Model download consent UX**: v1 auto-downloads silently on first use. Deferred follow-ups (each its own task): (a) first-run consent prompt explaining the ~160 MB download and offering opt-out, (b) hosted-API providers gated by user-supplied keys (`VoyageAIEmbeddingProvider` for `voyage-code-3`, `OpenAIEmbeddingProvider` for `text-embedding-3-*`) wired through the existing `EmbeddingProvider` interface, (c) upgrade-rebuild policy when a newer recommended model ships (auto-re-download vs. notify-and-ask vs. opt-in only). The Decisions section above commits to keeping the `EmbeddingProvider` interface as the seam so these can land without re-architecting the clustering layer.
