import type { Anchor } from "@code-charter/types";

import { derive_code_state } from "../code_state";
import type { ResolverSymbol } from "../resolver_symbol";

/**
 * Hand-built {@link ResolverSymbol} scenarios for the pure cascade tests — no tree-sitter. Bodies
 * deliberately omit the symbol's own name so a "rename" twin shares `content_hash` with its original.
 */

/** Baseline top-level function. */
export const fn_a: ResolverSymbol = {
  file_path: "src/a.ts",
  name: "fn_a",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return 1;\n}",
};

/** Same symbol_path as {@link fn_a}, different body → different content_hash. */
export const fn_a_body_changed: ResolverSymbol = {
  ...fn_a,
  body_source: "{\n  return 2;\n}",
};

/** Same file, renamed; identical body so content_hash matches {@link fn_a} (same-file rename). */
export const fn_a_renamed: ResolverSymbol = {
  ...fn_a,
  name: "fn_a_renamed",
};

/** Different file, identical body → content_hash matches {@link fn_a} (cross-file move). */
export const fn_a_moved: ResolverSymbol = {
  ...fn_a,
  file_path: "src/moved.ts",
  name: "fn_a_moved",
};

/** Renamed AND re-bodied — neither the symbol_path nor the content_hash of {@link fn_a} survive. */
export const fn_a_renamed_and_changed: ResolverSymbol = {
  file_path: "src/a.ts",
  name: "fn_a_renamed",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return 99;\n}",
};

/** Two same-named methods on different classes in one file — must stay distinct. */
export const cls_x_run: ResolverSymbol = {
  file_path: "src/s.ts",
  name: "run",
  kind: "method",
  enclosing: ["X"],
  body_source: "{\n  return this.x;\n}",
};
export const cls_y_run: ResolverSymbol = {
  file_path: "src/s.ts",
  name: "run",
  kind: "method",
  enclosing: ["Y"],
  body_source: "{\n  return this.y;\n}",
};

/** The {@link Anchor} a symbol would be stored as when content was attached to it. */
export function anchor_of(symbol: ResolverSymbol): Anchor {
  const state = derive_code_state(symbol);
  return { symbol_path: state.symbol_path, content_hash: state.content_hash };
}
