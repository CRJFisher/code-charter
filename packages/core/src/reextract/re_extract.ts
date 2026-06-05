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
 * next session open and committed by `drift.resolve` — rather than re-anchored inline. The re-sync is
 * automatic and out-of-band (the resolver determines the target with no human authoring), but moving
 * authored content (a user-owned `description`) onto a different symbol is surfaced for an explicit
 * accept rather than applied silently: the determinism makes that accept a one-click commit, not a
 * re-resolve. A `miss` (the symbol is both renamed and re-bodied) soft-deletes the node into the
 * re-attachment bin.
 *
 * Alongside the per-node findings, `re_extract` promotes those same verdicts into a turn-level
 * {@link SymbolDelta} (`{added, removed, modified, relocated}` keyed by symbol_path; see `symbol_delta.ts`)
 * by diffing the fresh resolver index against the persisted-anchor baseline it accumulates in the same
 * pass. Downstream re-sync (`affected_persisted_flows`) and re-describe scope to that delta (task-27.1.6.4).
 *
 * `re_extract` is not a single transaction. Each store call is atomic and idempotent, so a re-run after
 * a mid-way failure re-applies cleanly: raw invalidation/extraction is repeatable and staging a
 * relocation twice is a no-op.
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
import { compute_symbol_delta } from "./symbol_delta";
import type { SymbolDelta } from "./symbol_delta";

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
  /** Optional diagnostics sink — used only to flag a baseline anomaly (a conflicting anchor). */
  log?: (message: string) => void;
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
  /** The turn-level symbol change set for `file_set` (AC#1) — drives scoped re-sync/re-describe. */
  delta: SymbolDelta;
}

/**
 * Re-extract `file_set` and reconcile the preserved tiers against the fresh code. See the module
 * docstring for the full contract. Returns one {@link DriftFinding} per relocated/missed node and the
 * turn-level {@link SymbolDelta} for the file set.
 */
export function re_extract(file_set: readonly string[], origin: ReExtractOrigin, deps: ReExtractDeps): ReExtractResult {
  const { store, extract_raw, build_index, analyzed_root } = deps;

  // 1. Replace only the raw tier for these files; preserved (agentic/user) rows survive untouched.
  store.invalidate_edges_for_files([...file_set]);
  store.invalidate_nodes_for_files([...file_set]);
  extract_raw(store, file_set);

  // 2. Rebuild the file-module scaffold for the freshly-extracted leaves (deterministic, idempotent).
  rebuild_file_module_scaffold(store, file_set, analyzed_root);

  // 3. Resolve every preserved, anchored node in the set against the fresh index — staging drift per
  //    node — and accumulate the persisted-anchor baseline the symbol delta diffs against.
  const index = build_index(file_set);
  const findings: DriftFinding[] = [];
  const baseline = new Map<string, string>();
  for (const node of preserved_anchored_nodes(store, file_set)) {
    const finding = reconcile_node(store, node, index);
    if (finding !== null) findings.push(finding);
    record_baseline_anchor(baseline, node, deps.log);
  }

  // 4. Promote the per-node verdicts into the turn-level symbol delta (AC#1).
  const delta = compute_symbol_delta(baseline, index);

  return { file_set, origin, findings, delta };
}

/**
 * Record one preserved node's anchor in the baseline (`symbol_path → content_hash`), first-wins.
 * Multiple preserved nodes may anchor to one symbol (e.g. a description and a behaviour); an identical
 * content_hash is the normal multiplicity and merges silently. A *conflicting* content_hash for the same
 * symbol_path is a baseline inconsistency: keep the first and log it loudly (never silently narrow),
 * mirroring `build_dedup_index`.
 */
function record_baseline_anchor(baseline: Map<string, string>, node: NodeRow, log?: (message: string) => void): void {
  const { symbol_path, content_hash } = parse_anchor(node.anchor!);
  const existing = baseline.get(symbol_path);
  if (existing === undefined) {
    baseline.set(symbol_path, content_hash);
  } else if (existing !== content_hash) {
    log?.(`symbol-delta baseline: conflicting content_hash for ${symbol_path}; keeping first`);
  }
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
 * `agentic.contains` edges (leaf → module). Path-derived ids make the current rows a deterministic
 * no-op REPLACE on re-run. A leaf that was renamed away leaves a `contains` edge keyed by its old id;
 * those stale edges (into a current group but absent from the fresh scaffold) are retired so the
 * scaffold does not accumulate orphaned edges across renames. Done with scoped upserts rather than
 * `rebuild_layer('agentic')`, which is store-global and would destroy other files' agentic content.
 */
function rebuild_file_module_scaffold(store: GraphStore, file_set: readonly string[], analyzed_root: string): void {
  const files = new Set(file_set);
  const leaves = store
    .all_nodes()
    .filter((node) => node.layer === "raw" && node.kind === "code.function" && files.has(node.path));
  const scaffold = build_module_scaffold(leaves, file_module_resolver(analyzed_root));

  // Retire stale containment: a contains edge into one of this run's groups whose key the fresh
  // scaffold no longer emits points at a renamed-away leaf. Soft-delete it so render/the adapter never
  // see a dangling edge and it does not pile up. (Scaffold rows are excluded from the re-attachment bin.)
  const live_group_ids = new Set(scaffold.module_nodes.map((node) => node.id));
  const fresh_edge_keys = new Set(scaffold.contains_edges.map((edge) => edge.key));
  for (const edge of store.all_edges()) {
    if (edge.kind !== "agentic.contains" || !live_group_ids.has(edge.dst_id) || fresh_edge_keys.has(edge.key)) {
      continue;
    }
    store.soft_delete({ kind: "edge", id: edge.key });
  }

  for (const module_node of scaffold.module_nodes) {
    store.upsert_node(module_node);
  }
  for (const contains_edge of scaffold.contains_edges) {
    store.upsert_edge(contains_edge, []);
  }
}
