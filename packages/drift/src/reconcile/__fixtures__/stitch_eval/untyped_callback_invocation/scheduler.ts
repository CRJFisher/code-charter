/**
 * Weakness: untyped_callback_invocation — the scheduler invokes a function-typed parameter
 * (`run()`); the parameter binding has no concrete callable target, so Ariadne cannot resolve the
 * invocation and the named callbacks the callers pass are promoted to their own orphan entrypoints.
 * Expected agent behaviour: recognise the callback contract and stitch the callers (and their
 * callbacks) with the scheduler into one umbrella, bridged at the `run()` call site.
 */
export function run_scheduled(run: () => void): void {
  run();
}
