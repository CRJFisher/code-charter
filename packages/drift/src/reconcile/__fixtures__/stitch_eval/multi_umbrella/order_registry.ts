/**
 * Weakness: multi_umbrella — TWO independent string-keyed dispatch clusters land in one changed
 * set. Each cluster's registry lookup is invisible to static analysis, so all six functions
 * fragment into singleton flows.
 * Expected agent behaviour: PARTITION — one umbrella per cluster (orders, mail), each bridged at
 * its own `fn()` site; never a single merged mega-umbrella, never six singletons.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2).
 */
// The order-handler table is populated by the deployment framework at startup, keyed by action
// name — the registration is invisible to static analysis.
const order_table = new Map<string, () => number>();

export function lookup_order_handler(key: string): () => number {
  return order_table.get(key)!;
}
