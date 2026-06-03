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

import type { AnchoredSymbol, AriadneFileInput, GraphStore, ResolverIndex } from "@code-charter/core";
import {
  anchored_symbols_from_ariadne,
  build_resolver_index,
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

export function make_ariadne_adapter(project: HeadlessProject): AriadneAdapter {
  return {
    call_graph: () => project.get_call_graph(),

    // The raw code layer is the in-memory call graph; nothing in v1 reads a persisted raw code tier, and
    // a raw `code.function` keyed by a seed symbol_path would collide with the flow node of the same id.
    extract_raw() {},

    build_index(file_set) {
      // `build_resolver_index` throws on a duplicate symbol_path (a derivation defect in one file); a
      // single pathological file must not break the hook, so index file-by-file and skip a thrower.
      const symbols = [];
      for (const input of file_inputs(project, file_set)) {
        try {
          symbols.push(...resolver_symbols_from_ariadne([input]));
        } catch {
          // skip the offending file's symbols; the rest of the set still reconciles.
        }
      }
      try {
        return build_resolver_index(symbols);
      } catch {
        // A cross-file duplicate: fall back to an empty index rather than aborting reconciliation.
        return build_resolver_index([]);
      }
    },

    anchored_symbols: (file_set) => anchored_symbols_from_ariadne(file_inputs(project, file_set)),

    file_of(symbol_id) {
      // Node locations are already repo-relative (the project is fed repo-relative paths).
      const node = project.get_call_graph().nodes.get(symbol_id);
      return node === undefined ? undefined : node.location.file_path;
    },
  };
}
