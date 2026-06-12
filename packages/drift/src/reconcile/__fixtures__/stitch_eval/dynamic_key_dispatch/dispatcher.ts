/**
 * Weakness: dynamic_key_dispatch — `fn()` is the result of a string-keyed registry lookup Ariadne
 * cannot resolve statically, so every registered handler is promoted to its own orphan entrypoint
 * and the dispatch functionality fragments into singleton flows.
 * Expected agent behaviour: stitch the dispatcher and both handlers into one umbrella, bridged at
 * the `fn()` call site.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
 * live agent scoring).
 */
import { lookup_handler } from "./registry";

export function dispatch(key: string): number {
  const fn = lookup_handler(key);
  return fn();
}
