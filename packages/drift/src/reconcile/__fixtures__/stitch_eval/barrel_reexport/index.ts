/**
 * Weakness: barrel_reexport — report.ts imports `compute_average` through this barrel re-export
 * rather than from stats.ts directly, and Ariadne fails to follow the chain. The pinned signal
 * (discovered empirically, not assumed): the caller orphans with an EMPTY `unresolved_sites` list
 * (no call node is recorded at all for the barrel-routed call), and the re-export counts as the
 * implementation's only reference, so `compute_average` never enters the entrypoint inventory —
 * the fragment to stitch is one the inventory never lists, though it still resolves in the live
 * graph as a seed.
 * Expected agent behaviour: grep `compute_average` from the orphan caller's source, follow this
 * barrel line to the implementation, and stitch a seeds-only umbrella that names the
 * never-promoted definition as a seed — no bridge, since no recorded site exists to corroborate.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
 * live agent scoring).
 */
export { compute_average } from "./stats";
