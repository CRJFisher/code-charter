/**
 * Weakness: fan_out — one routing hub dispatches to FOUR handlers through a string-keyed
 * registry, so the functionality fragments into five singleton flows and the umbrella's correct
 * membership is wide.
 * Expected agent behaviour: stitch the hub and EVERY handler into one umbrella, bridged at the
 * `fn()` site — absorbing only the first handler or two it reads is the failure this fixture
 * exists to catch.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2).
 */
// The route table is populated by the plugin loader at startup — invisible to static analysis.
const route_table = new Map<string, () => number>();

export function lookup_route(key: string): () => number {
  return route_table.get(key)!;
}
