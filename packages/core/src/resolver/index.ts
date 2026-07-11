/**
 * The single reusable anchor resolver.
 *
 * A stored anchor (`symbol_path:content_hash`) is matched against the current code by `resolve_anchor`,
 * which reports hit / downgrade / miss and never mutates. Both diagram↔code directions share it: drift
 * detection re-attaches content, and proposal snapshotting re-validates. The whole module is pure — zero
 * `node:sqlite`, importing only data shapes from `@ariadnejs/types` and the anchor/result types from
 * `@code-charter/types`.
 */

export { build_symbol_path, derive_code_state } from "./code_state";
export { format_anchor, parse_anchor } from "./anchor_string";
export { build_resolver_index } from "./resolver_index";
export type { ResolverIndex } from "./resolver_index";
export { resolve_anchor } from "./resolve_anchor";
export { anchored_symbols_from_ariadne, resolver_symbols_from_ariadne } from "./from_ariadne";
export type { AnchoredSymbol, AriadneFileInput } from "./from_ariadne";
export type { ResolverSymbol } from "./resolver_symbol";
