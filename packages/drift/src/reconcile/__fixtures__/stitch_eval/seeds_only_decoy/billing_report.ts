/**
 * Weakness (control): seeds_only_decoy — two orphan entrypoints with MAXIMAL surface similarity
 * (same verb shape, parallel structure, overlapping vocabulary) and zero connecting references:
 * no shared import, no registration, no call site anywhere. The seeds-only stitch path has no
 * bridge evidence to gate on, so name similarity is the only lure — and it is ranking, never
 * evidence.
 * Expected agent behaviour: DECLINE — leave two singleton flows, persist no bridge, form no
 * seeds-only umbrella.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2).
 */
function format_billing_rows(rows: readonly number[]): string {
  return rows.map((row) => `billing:${row}`).join("\n");
}

export function export_billing_report(rows: readonly number[]): string {
  return format_billing_rows(rows);
}
