import type { Anchor } from "@code-charter/types";

/**
 * The serialization boundary between the resolver and the store. A `NodeRow.anchor` (task-27.0) is
 * persisted as the single string `symbol_path:content_hash`; consumers read that column and parse it
 * back into a structured {@link Anchor} before calling `resolve_anchor`.
 */

const HEX64 = /^[0-9a-f]{64}$/;

/** `symbol_path:content_hash`. The inverse of {@link parse_anchor}. */
export function format_anchor(anchor: Anchor): string {
  return `${anchor.symbol_path}:${anchor.content_hash}`;
}

/**
 * Recover `(symbol_path, content_hash)` by splitting on the LAST colon. `symbol_path` itself contains
 * colons (the `:<kind>` suffix), but `content_hash` is a fixed-length 64-char hex sha256 with no
 * colon, so the final colon is always the boundary. Throws on a malformed string — a corrupt stored
 * anchor is a data-integrity bug at the persistence boundary, not a routine `miss`.
 */
export function parse_anchor(s: string): Anchor {
  const idx = s.lastIndexOf(":");
  if (idx === -1) {
    throw new Error(`Malformed anchor (no ':' separator): ${s}`);
  }
  const symbol_path = s.slice(0, idx);
  const content_hash = s.slice(idx + 1);
  if (symbol_path.length === 0) {
    throw new Error(`Malformed anchor (empty symbol_path): ${s}`);
  }
  if (!HEX64.test(content_hash)) {
    throw new Error(`Malformed anchor (content_hash is not a 64-char lowercase hex sha256): ${s}`);
  }
  return { symbol_path, content_hash };
}
