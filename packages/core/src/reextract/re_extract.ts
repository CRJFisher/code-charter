/**
 * task-27.1.2 AC#2/#3/#9 — the single named re-extraction entry point.
 *
 * `re_extract` is the one in-process funnel through which a changed file set is re-analyzed. The
 * `Stop`-hook reconciliation path (via the drift-reconciler sub-agent's drift-sync skill) and the
 * consistency engine are its only callers, each passing `origin='code-change'`; the `origin` union is
 * open so task-27.2's `origin='apply'` is one more value with no signature change.
 *
 * It re-extracts only the raw tier for the file set (never the whole store), rebuilds the file-module
 * scaffold for those files, then resolves every preserved (non-raw, anchored) node in the set against
 * the fresh code. A `relocated` verdict is staged as outstanding drift on the node — surfaced at the
 * next session open and committed by `drift.resolve` — rather than re-anchored inline: the resolve is
 * deterministic and runs out-of-band here, but the commit is the user-facing accept. A `miss` (the
 * symbol is both renamed and re-bodied) soft-deletes the node into the re-attachment bin.
 *
 * Core stays extractor-agnostic: the host supplies `extract_raw` (Ariadne in production, a fixture in
 * tests) and `build_index`, so `re_extract` itself imports no parser.
 */

import type { GraphStore, GraphTarget, NodeRow } from "@code-charter/types";

import { build_module_scaffold, file_module_resolver } from "../model/module_scaffold";
import { parse_anchor, resolve_anchor } from "../resolver";
import type { ResolverIndex } from "../resolver";
import {
  DRIFT_FROM_KEY,
  DRIFT_STATUS_KEY,
  DRIFT_STATUS_RELOCATED,
  DRIFT_TO_CONTENT_HASH_KEY,
  DRIFT_TO_SYMBOL_PATH_KEY,
} from "./drift_observation";

/** Where a re-extraction was triggered from. Open union — task-27.2 adds `'apply'` with no change. */
export type ReExtractOrigin = "code-change" | (string & {});

export interface ReExtractDeps {
  store: GraphStore;
  /**
   * Re-emit the raw tier for `file_set`: invalidate-then-write the `code.*` rows for those files. The
   * host supplies this (Ariadne in production, a fixture in tests) so core imports no parser. It is
   * called after raw invalidation, inside `re_extract`.
   */
  extract_raw: (store: GraphStore, file_set: readonly string[]) => void;
  /** Build a resolver index over the current code state of `file_set`. */
  build_index: (file_set: readonly string[]) => ResolverIndex;
  /** Repo-relative prefix; leaves outside it bucket under `<external>` in the scaffold (AC#9). */
  analyzed_root: string;
}

/** One node the resolver moved (or lost) during a re-extraction. */
export interface DriftFinding {
  node_id: string;
  from_symbol_path: string;
  /** The relocated target, or null on a `miss`. */
  to_symbol_path: string | null;
  reason: "relocated" | "miss";
}

export interface ReExtractResult {
  file_set: readonly string[];
  origin: ReExtractOrigin;
  findings: DriftFinding[];
}

/**
 * Re-extract `file_set` and reconcile the preserved tiers against the fresh code. See the module
 * docstring for the full contract. Returns one {@link DriftFinding} per relocated/missed node.
 */
export function re_extract(file_set: readonly string[], origin: ReExtractOrigin, deps: ReExtractDeps): ReExtractResult {
  const { store, extract_raw, build_index, analyzed_root } = deps;

  // 1. Replace only the raw tier for these files; preserved (agentic/user) rows survive untouched.
  store.invalidate_edges_for_files([...file_set]);
  store.invalidate_nodes_for_files([...file_set]);
  extract_raw(store, file_set);

  // 2. Rebuild the file-module scaffold for the freshly-extracted leaves (deterministic, idempotent).
  rebuild_file_module_scaffold(store, file_set, analyzed_root);

  // 3. Resolve every preserved, anchored node in the set against the fresh index.
  const index = build_index(file_set);
  const findings: DriftFinding[] = [];
  for (const node of preserved_anchored_nodes(store, file_set)) {
    const finding = reconcile_node(store, node, index);
    if (finding !== null) findings.push(finding);
  }

  return { file_set, origin, findings };
}

/** The live preserved (non-raw), anchored nodes whose defining file is in `file_set`. */
function preserved_anchored_nodes(store: GraphStore, file_set: readonly string[]): NodeRow[] {
  const files = new Set(file_set);
  return store
    .all_nodes()
    .filter((node) => node.layer !== "raw" && node.anchor !== null && files.has(node.path));
}

/** Stage a relocation as outstanding drift, or bin a miss. Returns the finding, or null on hit/body-changed. */
function reconcile_node(store: GraphStore, node: NodeRow, index: ResolverIndex): DriftFinding | null {
  const anchor = parse_anchor(node.anchor!);
  const result = resolve_anchor(anchor, index);
  const target: GraphTarget = { kind: "node", id: node.id };

  if (result.status === "downgrade" && result.reason === "relocated") {
    store.write_fields(
      target,
      {
        [DRIFT_STATUS_KEY]: DRIFT_STATUS_RELOCATED,
        [DRIFT_FROM_KEY]: anchor.symbol_path,
        [DRIFT_TO_SYMBOL_PATH_KEY]: result.state.symbol_path,
        [DRIFT_TO_CONTENT_HASH_KEY]: result.state.content_hash,
      },
      "agentic",
    );
    return { node_id: node.id, from_symbol_path: anchor.symbol_path, to_symbol_path: result.state.symbol_path, reason: "relocated" };
  }

  if (result.status === "miss") {
    store.soft_delete(target);
    return { node_id: node.id, from_symbol_path: anchor.symbol_path, to_symbol_path: null, reason: "miss" };
  }

  // hit / body-changed: the symbol_path still resolves, so the node points at the right symbol — no drift.
  return null;
}

/**
 * Emit one `agentic.group` per defining file for the current raw leaves of `file_set`, with
 * `agentic.contains` edges (leaf → module). Idempotent: deterministic path-derived ids make a re-run a
 * no-op REPLACE. Done with scoped upserts rather than `rebuild_layer('agentic')`, which is store-global
 * and would destroy other files' agentic content.
 */
function rebuild_file_module_scaffold(store: GraphStore, file_set: readonly string[], analyzed_root: string): void {
  const files = new Set(file_set);
  const leaves = store
    .all_nodes()
    .filter((node) => node.layer === "raw" && node.kind === "code.function" && files.has(node.path));
  const scaffold = build_module_scaffold(leaves, file_module_resolver(analyzed_root));
  for (const module_node of scaffold.module_nodes) {
    store.upsert_node(module_node);
  }
  for (const contains_edge of scaffold.contains_edges) {
    store.upsert_edge(contains_edge, []);
  }
}
