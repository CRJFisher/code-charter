import * as crypto from "crypto";
import type { CallableNode } from "@ariadnejs/types";

/**
 * Computes a deterministic content hash from docstrings and call graph edges.
 * Used to detect when cluster summaries are stale.
 */
export function compute_content_hash(
  docstrings: Record<string, string>,
  call_tree: Record<string, CallableNode>
): string {
  const sorted_docstrings = Object.keys(docstrings)
    .sort()
    .map((k) => [k, docstrings[k]]);

  const sorted_edges = Object.keys(call_tree)
    .sort()
    .map((k) => [k, call_tree[k].enclosed_calls.flatMap((c) => c.resolutions.map((r) => r.symbol_id)).sort()]);

  const canonical = JSON.stringify({ docstrings: sorted_docstrings, edges: sorted_edges });
  return crypto.createHash("sha256").update(canonical).digest("hex").substring(0, 16);
}

/**
 * Computes a fast source hash from file contents for staleness detection in the stop hook.
 */
export function compute_source_hash(file_contents: Map<string, string>): string {
  const hash = crypto.createHash("sha256");
  const sorted_entries = Array.from(file_contents.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted_entries) {
    hash.update(key);
    hash.update("\0");
    hash.update(value);
    hash.update("\0");
  }
  return hash.digest("hex").substring(0, 16);
}
