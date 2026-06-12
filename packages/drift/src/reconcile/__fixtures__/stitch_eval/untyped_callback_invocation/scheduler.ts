/**
 * Weakness: untyped_callback_invocation — the scheduler invokes a function-typed parameter
 * (`run()`); the parameter binding has no concrete callable target, so Ariadne cannot resolve the
 * invocation and each caller is promoted to its own orphan entrypoint.
 * Expected agent behaviour: recognise the callback contract and stitch the callers with the
 * scheduler into one umbrella, bridged at the `run()` call site.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
 * live agent scoring).
 */
export function run_scheduled(run: () => void): void {
  run();
}
