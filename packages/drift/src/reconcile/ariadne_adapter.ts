/**
 * The headless Ariadne adapter: the production implementation of the host deps `re_extract` injects
 * (`extract_raw` + `build_index`), plus the `CallGraph` and anchored-symbol bridge the hydration engine
 * needs. It is the single producer of raw rows in the store — nothing else populates the raw tier on a
 * non-VSCode host.
 *
 * Two id spaces meet here and are kept separate. The `CallGraph` is keyed by Ariadne `SymbolId`
 * (location-based); the persisted rows use the resolver's rename-stable, enclosing-qualified
 * `symbol_path`. The adapter speaks repo-relative posix paths to the store and absolute paths to Ariadne,
 * converting once at the boundary so `symbol_path`s always embed the repo-relative file.
 *
 * The store's persisted layers are the agentic flow/description/bridge rows, the skill doc tier, and
 * user content; the raw CODE layer is the in-memory `CallGraph`, regenerated each run. Persisting raw
 * `code.function` nodes would collide with the agentic flow node keyed by the same seed `symbol_path`
 * (the flow's stable id), and nothing in v1 reads a persisted raw code tier (membership and render use
 * the in-memory graph; the resolver reconcile uses a fresh index). So `extract_raw` does not materialize
 * raw code rows — re_extract still drives the preservation reconcile against `build_index`.
 */

import type { AnchoredSymbol, AriadneFileInput, GraphStore, ResolverIndex, ResolverSymbol } from "@code-charter/core";
import {
  anchored_symbols_from_ariadne,
  build_resolver_index,
  build_symbol_path,
  resolver_symbols_from_ariadne,
} from "@code-charter/core";
import type { AnyDefinition, CallGraph, SymbolId } from "@ariadnejs/types";

import { HeadlessProject, is_supported_source } from "./headless_project";

/** The seam between the reconcile engine and Ariadne — everything the engine reads about the code. */
export interface AriadneAdapter {
  /** The live in-memory call graph (the source of truth for flow membership + render). */
  call_graph(): CallGraph;
  /** The `re_extract` `extract_raw` dep. A no-op in v1: the raw code layer is the in-memory call graph. */
  extract_raw(store: GraphStore, file_set: readonly string[]): void;
  /** Build a resolver index over `file_set`'s current code. The `re_extract` `build_index` dep. */
  build_index(file_set: readonly string[]): ResolverIndex;
  /** Anchorable callables in `file_set`, each carrying its `SymbolId` (the describe-step input). */
  anchored_symbols(file_set: readonly string[]): AnchoredSymbol[];
  /** Repo-relative defining file of a call-graph node, or undefined when it is not a graph node. */
  file_of(symbol_id: SymbolId): string | undefined;
}

/** Assemble the per-file Ariadne inputs (top-level definitions + source) for `rel_files`. */
function file_inputs(project: HeadlessProject, rel_files: readonly string[]): AriadneFileInput[] {
  const inputs: AriadneFileInput[] = [];
  for (const rel of rel_files) {
    if (!is_supported_source(rel)) continue;
    const index = project.get_index_single_file(rel);
    const source = project.get_source(rel);
    if (index === undefined || source === undefined) continue;
    // Top-level definitions only — `from_ariadne` reaches methods/constructors structurally.
    const definitions: AnyDefinition[] = [
      ...index.functions.values(),
      ...index.classes.values(),
      ...index.interfaces.values(),
      ...index.enums.values(),
    ];
    inputs.push({ file_path: rel, source, definitions });
  }
  return inputs;
}

/**
 * Index `symbols` after deduping by derived `symbol_path` (first-wins, in input order). `build_resolver_index`
 * throws on a duplicate symbol_path; left to reach it, that throw would collapse the whole index to empty
 * and make `re_extract` mass-soft-delete every preserved description. Deduping first means a residual
 * duplicate can never reach the throw.
 *
 * Anonymous callables — the routine source of colliding symbol_paths — are excluded upstream in
 * `walk_callables`, so in normal operation nothing is dropped here. The dedup guards the residual case:
 * two *named* symbols that still derive one `symbol_path` (a derivation defect, e.g. a redeclaration or a
 * future emitter change). That should never happen, so a drop is logged loudly for investigation, never
 * silently capped (no silent narrowing). The dedup key is `build_symbol_path` — exactly the key
 * `build_resolver_index` derives internally via `derive_code_state`, so the two cannot disagree.
 */
export function build_dedup_index(
  symbols: readonly ResolverSymbol[],
  log: (message: string) => void,
): ResolverIndex {
  const by_path = new Map<string, ResolverSymbol>();
  for (const symbol of symbols) {
    const symbol_path = build_symbol_path(symbol.file_path, symbol.enclosing, symbol.name, symbol.kind);
    if (by_path.has(symbol_path)) {
      log(`build_index: dropped duplicate symbol_path ${symbol_path}`);
      continue;
    }
    by_path.set(symbol_path, symbol);
  }
  return build_resolver_index([...by_path.values()]);
}

export function make_ariadne_adapter(
  project: HeadlessProject,
  log: (message: string) => void,
): AriadneAdapter {
  return {
    call_graph: () => project.get_call_graph(),

    // The raw code layer is the in-memory call graph; nothing in v1 reads a persisted raw code tier, and
    // a raw `code.function` keyed by a seed symbol_path would collide with the flow node of the same id.
    extract_raw() {},

    build_index: (file_set) => build_dedup_index(resolver_symbols_from_ariadne(file_inputs(project, file_set)), log),

    anchored_symbols: (file_set) => anchored_symbols_from_ariadne(file_inputs(project, file_set)),

    file_of(symbol_id) {
      // Node locations are already repo-relative (the project is fed repo-relative paths).
      const node = project.get_call_graph().nodes.get(symbol_id);
      return node === undefined ? undefined : node.location.file_path;
    },
  };
}
