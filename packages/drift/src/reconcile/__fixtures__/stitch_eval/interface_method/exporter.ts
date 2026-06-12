/**
 * Weakness: interface_method — `run_export` calls `target.export_rows(count)` through an
 * interface-typed value whose concrete implementation lives in another file and satisfies the
 * interface structurally (an explicit `implements Exporter` clause lets Ariadne link the call and
 * nothing fragments — empirically pinned, the same reason dynamic_key_dispatch keeps its
 * registration out of band). Ariadne records no call reference at all for the structural
 * interface call, so the implementation's method surfaces as an orphan entrypoint with an EMPTY
 * `unresolved_sites` list — the evidence-less class: orphan-ness is the only signal. The exporter
 * instance is module-level, keeping constructor calls out of every entrypoint's tree, so no
 * unresolved site exists anywhere in the inventory and no bridge can be corroborated.
 * Expected agent behaviour: find the connection by grepping the orphan method's name (interface
 * declaration, call site, and implementation all carry `export_rows`) and stitch a seeds-only
 * umbrella with NO bridge — the bin rejects bridges the graph cannot corroborate.
 * Consumed by reconcile_stitch_eval.test.ts (Tier 1, structural) and bin/stitch_eval.ts (Tier 2,
 * live agent scoring).
 */
export interface Exporter {
  export_rows(count: number): number;
}

export function run_export(target: Exporter, count: number): number {
  return target.export_rows(count);
}
