---
id: task-14
title: >-
  Rethink code-charter: docstring-driven summaries with Claude Code hooks and
  skills
status: To Do
assignee: []
created_date: '2026-03-19'
labels: []
dependencies: []
---

## Description

Fundamentally rethink how code-charter works. Instead of generating LLM summaries of functions, rely on every function having a docstring "body" (i.e. not param descriptions) which is used as the text summary. Code-charter becomes deeply integrated with Claude Code features: hooks enforce docstring presence, trigger re-clustering, and a skill defines how cluster summaries are updated. The LLM summarization pipeline (LangChain, PouchDB) is removed entirely.

This supersedes tasks 7, 7.1, 7.2, 7.3, 7.4, 8, 9, 9.2, 9.3, 10, 11, 12, and 13.

## Acceptance Criteria

- [ ] Stop hook enforces docstrings on modified/added functions
- [ ] Stop hook detects stale clusters via fast fingerprint check
- [ ] Skill defines how to update cluster summaries via Claude
- [ ] Cluster summary data stored in JSON (committed to git)
- [ ] LLM summarization pipeline removed (LangChain and PouchDB removed)
- [ ] Clustering decoupled from VS Code APIs (injectable interfaces)
- [ ] Docstring extraction via DocstringProvider interface (regex fallback, ariadne adapter later)
- [ ] UI adapted to read from docstrings and JSON cluster data
- [ ] Bootstrap CLI command for first-run without Claude Code

## Reviewer Feedback (incorporated)

Five Opus reviewers examined this plan from different perspectives. Key changes made:

**Architecture (Systems Architect)**:
- Hook Phase 2 reduced to fingerprint-only check; heavy computation deferred to skill/CLI
- Removed `member_docstrings` from committed `cluster-summaries.json` (git churn)
- Single `schema_version` in manifest only, not repeated in every file
- Added bootstrap/first-run path for VS Code standalone users
- Undocumented functions use name+signature as fallback embedding text, not excluded

**Pragmatic Engineering**:
- Dropped premature package extraction (`packages/clustering/`). Instead, decouple `clustering_service.ts` from VS Code with dependency injection (~30-line refactor)
- Dropped 4-hash fingerprinting system for v1. Simple single content hash; recompute when asked
- Simplified storage to 2 files: `cluster-summaries.json` (committed) + `cache.json` (gitignored)
- Consolidated 9 phases into 6 sub-tasks
- Deferred incremental embedding, sha256 migration, L1 normalization as separate future work

**Developer Experience**:
- Docstring check scoped to modified/added functions only (not all functions in changed files)
- Tiered enforcement: exported/public functions required, trivials/one-liners exempt
- Phase 2 of hook is non-blocking (advisory), not blocking
- Hook block message includes explanation of WHY + offer to generate docstrings
- Added `code-charter init` bootstrap command

**Ariadne Dependency Risk**:
- Created `DocstringProvider` interface to decouple from ariadne
- `RegexDocstringProvider` as immediate fallback (ships without ariadne prerequisite work)
- `AriadneDocstringProvider` as upgrade path when ariadne ships JSDoc extraction
- Ariadne prerequisite work split into its own task with independent ACs
- Pinned ariadne to exact version (no caret range)

**Testing**:
- Fix existing broken tests BEFORE starting migration (prerequisite)
- Type migration (Phase 5 equivalent) must be atomic single commit
- Create clustering quality benchmark before removing LLM summaries
- Expanded hook test cases for full state machine coverage

## Implementation Plan

### Architecture Overview

The system has four major components:

1. **Single combined Stop Hook** (`.claude/hooks/stop_check.mjs`) -- Phase 1 checks docstrings (blocking), Phase 2 checks cluster staleness (advisory/non-blocking)
2. **Cluster Summary Skill** (`.claude/skills/update-cluster-summaries/SKILL.md`) -- Claude generates/updates summaries
3. **DocstringProvider interface** with regex fallback -- decouples from ariadne release timeline
4. **JSON storage** -- `cluster-summaries.json` (committed) + `.code-charter/cache.json` (gitignored)

### Key Design Decisions

**Single combined hook with two phases**: Multiple Stop hooks run in parallel in Claude Code. Phase 1 (docstring check) is blocking. Phase 2 (cluster staleness) is non-blocking/advisory -- it reports stale clusters but doesn't prevent stopping.

**DocstringProvider interface**: All consumers program against this interface, not ariadne directly. Ships with `RegexDocstringProvider` (matches `/** ... */` before declarations). `AriadneDocstringProvider` added when ariadne ships JSDoc extraction.

**Hook Phase 2 is fingerprint-only**: The hook computes a content hash and compares to stored hash. If stale, it advises the user to run `/update-cluster-summaries`. It does NOT run embedding generation or clustering inline -- that's deferred to the skill or a CLI command.

**Scoped docstring enforcement**: Only checks functions that were modified or added in the current git diff. Exempt: one-liners, anonymous functions, test files, generated files. Required: exported functions, public class methods, functions >10 lines.

### Orchestration State Machine

```
Claude edits code -> stops -> Hook fires
  -> Phase 1: Modified functions missing docstrings?
    YES -> Block: "Add docstrings to: [list]. Reply 'generate docstrings' to let me write them."
    NO  -> Phase 2: Cluster fingerprint stale?
      YES -> Advisory (non-blocking): "Clusters may need updating. Run /update-cluster-summaries"
      NO  -> Allow stop
If stop_hook_active=true -> Always allow stop (prevent infinite loop)
```

### Data Storage

Two files only:

**`cluster-summaries.json`** (committed to git) -- the primary artifact:
```typescript
interface ClusterSummariesFile {
  content_hash: string;          // hash of docstrings+edges that produced these clusters
  generated_at: string;
  clusters: Array<{
    cluster_id: number;
    label: string;               // short label (<60 chars)
    description: string;         // 1-3 sentences
    members: string[];           // symbol IDs
    depends_on: number[];
    depended_on_by: number[];
  }>;
}
```

**`.code-charter/cache.json`** (gitignored) -- embeddings + cluster assignments + metadata:
```typescript
interface CacheFile {
  content_hash: string;
  embedding_provider: string;
  embeddings: Record<string, number[]>;
  cluster_assignments: number[];  // parallel to symbol list
  symbols: string[];              // ordered symbol list
}
```

### Stop Hook Implementation

**Phase 1 -- Docstring Check (blocking)**:
1. Read stdin JSON, check `stop_hook_active` (exit 0 if true)
2. Run `git diff --name-only HEAD` to find changed files
3. Parse diff hunks to identify modified/added function ranges
4. Use `DocstringProvider` to check docstrings on those functions
5. If missing on exported/public/non-trivial functions: block with helpful message
6. If all present: proceed to Phase 2

**Phase 2 -- Cluster Staleness (non-blocking advisory)**:
1. Compute content hash of all docstrings + call graph edges
2. Compare to `content_hash` in `cluster-summaries.json`
3. If stale: output `{"systemMessage": "Clusters may be stale. Consider running /update-cluster-summaries"}` (non-blocking)
4. If current: exit 0

### DocstringProvider Interface

```typescript
interface DocstringProvider {
  get_docstrings(file_path: string, content: string): Map<string, DocstringInfo>;
}

interface DocstringInfo {
  symbol_name: string;
  raw: string;
  body: string;  // after stripping @param/@returns
  line: number;
}
```

**RegexDocstringProvider** (ships immediately):
- Matches `/** ... */` preceding function/class/method declarations via regex
- Strips JSDoc tags to extract body
- Handles ~80% of real-world JSDoc patterns
- No tree-sitter dependency

**AriadneDocstringProvider** (upgrade path):
- Uses ariadne's `SemanticIndex` with `definition.docstring`
- Higher accuracy, handles edge cases (decorators, complex expressions)
- Depends on ariadne shipping JSDoc `.scm` patterns

### Skill Implementation

```yaml
---
name: update-cluster-summaries
description: Generate or update cluster summaries for code-charter visualization. Run when the stop hook reports stale clusters, or manually to refresh.
disable-model-invocation: true
allowed-tools: Read, Write, Bash(cat:*, ls:*, jq:*, node:*)
---
```

The skill:
1. Runs the clustering pipeline (via a Node.js script): parse call graph, extract docstrings, embed, cluster
2. Reads existing `cluster-summaries.json`
3. For changed clusters: generates action-focused summaries (<120 chars, telegraph-style, domain language)
4. Writes updated `cluster-summaries.json`

### Clustering Decoupling (not a new package)

Instead of extracting to `packages/clustering/`, refactor `clustering_service.ts` in-place:
- Replace `vscode.Uri`/`vscode.workspace.fs` with injected `CacheStorage` interface
- Replace OpenAI/local embedding provider initialization with injected `EmbeddingProvider` interface
- Remove `vscode.ExtensionContext` dependency
- Keep `clustering-tfjs` spectral clustering
- ~30-line refactor, not a new package

The same class can then be imported by hook scripts via relative path to compiled output.

### Dependency Removal

**Remove** (16 packages): `langchain`, `@langchain/core`, `@langchain/ollama`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/google-vertexai`, `pouchdb`, `pouchdb-upsert`, `@types/pouchdb`, `openai`, `@tensorflow/tfjs-node`, `@xenova/transformers`, `@vscode/python-extension`, `@babel/core`, `@babel/preset-env`, `@babel/preset-typescript`, `babel-jest`

**Delete** (13 files): `summarise/summarise.ts`, `summarise/caching.ts`, `summarise/domainContext.ts`, `summarise/summariseClusters.ts` (extract graph utils first), `summarise/__tests__/domainContext.test.ts`, `summarise/__tests__/summariseClusters.test.ts`, `model.ts`, `clustering_service_old.ts`, `embedding_provider_selector.ts`, `run.ts`, `webviewApi.ts`, `git.ts`, `hashing.ts`

### Type Changes

Replace `TreeAndContextSummaries` with:
```typescript
interface DocstringSummaries {
  docstrings: Record<string, string>;        // symbol -> docstring body
  call_tree: Record<string, CallGraphNode>;  // all nodes (undocumented use name+sig as fallback)
}
```

Rename `summariseCodeTree` -> `get_code_tree_descriptions` to match new semantics.

### Bootstrap / First-Run

Add `code-charter init` CLI command (or VS Code command) that:
1. Scans the codebase with ariadne/regex
2. Reports documentation coverage
3. Runs the clustering pipeline
4. Generates initial cluster summaries (using Claude or simple heuristic)
5. Creates `cluster-summaries.json` and `.code-charter/cache.json`
6. Works independently of Claude Code hooks

### Sub-Tasks

This task is split into 6 atomic sub-tasks (see task-14.1 through task-14.6).
