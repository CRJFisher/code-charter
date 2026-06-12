/**
 * Control: control_unrelated_pair — two genuinely independent entrypoints in the same
 * neighbourhood (different domains, no shared call sites, no unresolved links); the fixture
 * contains no Ariadne resolution weakness.
 * Expected agent behaviour: decline to stitch — the two entrypoints stay singleton flows
 * (the false-positive guard).
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
 * live agent scoring).
 */
export function to_fahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}
