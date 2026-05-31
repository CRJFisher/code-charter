import type { SymbolKind } from "@ariadnejs/types";

/**
 * The narrow, normalized input the resolver index is built from — one record per
 * anchorable code symbol. It is deliberately Ariadne-light: it carries only the data
 * the three derived identifiers ({@link CodeState}) need, so the pure resolver never
 * touches a live Ariadne `Project`, a scope tree, or the filesystem.
 *
 * `from_ariadne` produces these from Ariadne definitions + source; hand-built records
 * drive the cascade's unit tests.
 */
export interface ResolverSymbol {
  /** Repo-relative, forward-slash file path. The file-qualifying prefix of `symbol_path`. */
  file_path: string;
  /** The symbol's own identifier (stripped from the body so a pure rename is hash-stable). */
  name: string;
  /** Ariadne symbol kind, retained in `symbol_path` to separate overloads (method vs property). */
  kind: SymbolKind;
  /** Enclosing class/namespace names, outer→inner; `[]` for a top-level symbol. */
  enclosing: readonly string[];
  /** Exact source text of the symbol's body span — hashed for `content_hash`/`span_hash`. */
  body_source: string;
}
