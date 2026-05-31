import { createHash } from "node:crypto";

import type { CodeState } from "@code-charter/types";

import type { ResolverSymbol } from "./resolver_symbol";

/**
 * The derivation of the three identifiers that make an anchor rename- and move-stable.
 * Pure functions over a {@link ResolverSymbol}; no Ariadne, no filesystem, no sqlite.
 */

/**
 * `symbol_path` = file path + the enclosing class/namespace chain + the symbol's own name + its kind.
 *
 * Location-free within a file (no line/column) but file-qualified, so a same-file rename moves only
 * the name segment (recoverable as a downgrade) while two same-named methods on different classes stay
 * distinct. Three separators on value-classes that cannot contain them keep it unambiguous: `#` divides
 * the (`#`-free) file path from the qualified name; `.` joins identifier segments (which cannot contain
 * `.`); the trailing `:<kind>` is a bare lowercase word with no `.` or `:`.
 */
export function build_symbol_path(
  file_path: string,
  enclosing: readonly string[],
  name: string,
  kind: string,
): string {
  const qualified = [...enclosing, name].join(".");
  return `${file_path}#${qualified}:${kind}`;
}

function escape_regex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `content_hash` = sha256 of the body, leading/trailing whitespace trimmed and every occurrence of
 * the symbol's own identifier removed. Stripping all occurrences (not just the declaration) keeps
 * recursive self-calls from changing the hash, so a pure rename leaves `content_hash` stable — the
 * basis for resolving a rename as `relocated`. Internal whitespace is left untouched (collapsing
 * would be lossy and language-sensitive).
 *
 * Identifier-aware boundaries `(?<![$\w])name(?![$\w])` are used rather than `\b`: they treat `$`
 * (a JS/TS identifier char that `\b`/`\w` excludes) as part of the identifier, so `$fn` strips
 * cleanly while `foo` is never stripped out of `foobar`. Non-ASCII identifiers are not covered (YAGNI).
 */
export function compute_content_hash(body_source: string, name: string): string {
  let normalized = body_source.trim();
  if (name.length > 0) {
    normalized = normalized.replace(new RegExp(`(?<![$\\w])${escape_regex(name)}(?![$\\w])`, "g"), "");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * `span_hash` = sha256 of the exact body span (untrimmed, identifier not stripped). The byte-fidelity
 * counterpart to `content_hash`, reserved by the task-27.0 plan with no current consumer.
 */
export function compute_span_hash(body_source: string): string {
  return createHash("sha256").update(body_source, "utf8").digest("hex");
}

/** Assemble the full {@link CodeState} triple a `ResolverSymbol` resolves to. */
export function derive_code_state(symbol: ResolverSymbol): CodeState {
  return {
    symbol_path: build_symbol_path(symbol.file_path, symbol.enclosing, symbol.name, symbol.kind),
    content_hash: compute_content_hash(symbol.body_source, symbol.name),
    span_hash: compute_span_hash(symbol.body_source),
  };
}
