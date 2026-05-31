import type { Anchor, ResolveResult } from "@code-charter/types";

import type { ResolverIndex } from "./resolver_index";

/**
 * The single place a stored anchor becomes current code state. Pure: it only reports, never mutates
 * and never decides policy. The ordered cascade (task-27.0.3 AC#2):
 *
 *   1. exact symbol_path + content_hash      → hit
 *   2. symbol_path matches, content differs   → downgrade / body-changed
 *   3. content matches at a different path     → downgrade / relocated (rename-in-place or cross-file move)
 *   4. otherwise                               → miss (e.g. a simultaneous rename + body-change)
 *
 * Order is load-bearing: body-changed is evaluated before relocated, so a body still present at its
 * own path is never reported as relocated just because a copy exists elsewhere. The non-miss arms
 * carry the whole current `CodeState`; `miss` carries nothing.
 */
export function resolve_anchor(anchor: Anchor, index: ResolverIndex): ResolveResult {
  const current = index.by_symbol_path.get(anchor.symbol_path);

  // (1) hit — same place, same body.
  if (current && current.content_hash === anchor.content_hash) {
    return { status: "hit", state: current };
  }

  // (2) body-changed — same place, body differs. Before (3) so it wins over a relocation twin.
  if (current) {
    return { status: "downgrade", reason: "body-changed", state: current };
  }

  // (3) relocated — the symbol_path is gone, but the body lives elsewhere now. The bucket is sorted
  // by symbol_path, so the first candidate is the deterministic pick when several bodies match; the
  // pick is genuinely ambiguous among identical bodies, so reproducibility is the only goal (the
  // caller re-adjudicates). The `!==` is defensive: arm 3 is only reached when anchor.symbol_path is
  // absent from the index, so no bucket entry can carry it.
  const bucket = index.by_content_hash.get(anchor.content_hash);
  if (bucket) {
    const candidate = bucket.find((state) => state.symbol_path !== anchor.symbol_path);
    if (candidate) {
      return { status: "downgrade", reason: "relocated", state: candidate };
    }
  }

  // (4) miss — not resolvable; the caller preserves the content for re-attachment.
  return { status: "miss" };
}
