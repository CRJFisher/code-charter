import * as crypto from "crypto";
import type { CallGraphNode } from "@ariadnejs/types";

/**
 * Computes a deterministic content hash from docstrings and call graph edges.
 * Used to detect when cluster summaries are stale.
 */
export function compute_content_hash(
  docstrings: Record<string, string>,
  call_tree: Record<string, CallGraphNode>
): string {
  const sorted_docstrings = Object.keys(docstrings)
    .sort()
    .map((k) => [k, docstrings[k]]);

  const sorted_edges = Object.keys(call_tree)
    .sort()
    .map((k) => [k, call_tree[k].calls.map((c) => c.symbol).sort()]);

  const canonical = JSON.stringify({
    docstrings: sorted_docstrings,
    edges: sorted_edges,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").substring(0, 16);
}

/**
 * Computes a fast source hash from file contents for staleness detection.
 */
export function compute_source_hash(
  file_contents: Map<string, string>
): string {
  const hash = crypto.createHash("sha256");
  const sorted_keys = Array.from(file_contents.keys()).sort();
  for (const key of sorted_keys) {
    hash.update(key);
    hash.update(file_contents.get(key)!);
  }
  return hash.digest("hex").substring(0, 16);
}
