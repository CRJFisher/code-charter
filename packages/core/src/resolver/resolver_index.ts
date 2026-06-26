import type { CodeState } from "@code-charter/types";

import { derive_code_state } from "./code_state";
import type { ResolverSymbol } from "./resolver_symbol";

/**
 * The current code, shaped for the two questions the cascade asks: "what state is at THIS symbol_path?"
 * (hit / body-changed) and "what states carry THIS content_hash?" (relocated). Built once per resolve
 * pass; both lookups are O(1).
 */
export interface ResolverIndex {
  readonly by_symbol_path: ReadonlyMap<string, CodeState>;
  /** Each bucket is sorted by symbol_path so the relocated tie-break is deterministic. */
  readonly by_content_hash: ReadonlyMap<string, readonly CodeState[]>;
}

/**
 * Derive one {@link CodeState} per symbol and index it both ways. Throws on a duplicate `symbol_path`:
 * two truly indistinguishable symbols (same file, chain, name, kind) are a derivation defect to fix
 * upstream, never silently overwritten — a silent overwrite would make the hit/body-changed arms
 * depend on input order.
 */
export function build_resolver_index(symbols: readonly ResolverSymbol[]): ResolverIndex {
  const by_symbol_path = new Map<string, CodeState>();
  const by_content_hash = new Map<string, CodeState[]>();

  for (const symbol of symbols) {
    const state = derive_code_state(symbol);
    if (by_symbol_path.has(state.symbol_path)) {
      throw new Error(`duplicate symbol_path in resolver index: ${state.symbol_path}`);
    }
    by_symbol_path.set(state.symbol_path, state);

    const bucket = by_content_hash.get(state.content_hash);
    if (bucket) {
      bucket.push(state);
    } else {
      by_content_hash.set(state.content_hash, [state]);
    }
  }

  // Code-unit order (not locale-aware) so the relocated tie-break is reproducible across environments.
  for (const bucket of by_content_hash.values()) {
    bucket.sort((a, b) => (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));
  }

  return { by_symbol_path, by_content_hash };
}
