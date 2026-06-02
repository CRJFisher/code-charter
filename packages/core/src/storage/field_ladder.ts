import { TIER_RANK, type Tier } from "@code-charter/types";

/**
 * The per-field precedence ladder (`user > agentic > raw`), in one place.
 *
 * For each entry in `fields`, the write lands iff the field's current owner ranks at or below
 * `as_tier`: the value is written into `attributes` and the field is stamped in `ownership` as owned
 * by `as_tier`. Otherwise a higher tier owns the field and the write is left untouched and reported in
 * `skipped`. A field with no recorded owner defaults to `raw` (the lowest tier), so a first write at
 * any tier always lands. Both `attributes` and `ownership` are mutated in place.
 *
 * This is the single source of truth shared by the persistent store ({@link SqliteGraphStore.write_fields})
 * and the in-memory model (`CustomGraphModel.write_fields`), so the two compute identical accept/skip
 * decisions for the same starting state. The store surfaces only `skipped`; the model also uses
 * `written` to know which fields to flush.
 *
 * This helper is deliberately field-bag-only: it never reads or writes structural columns. The
 * structural `layer` promotion that a landed user-tier write triggers lives in each `write_fields`
 * wrapper (which holds the row), keeping store/model parity on the ladder decision itself.
 */
export function apply_field_ladder(
  attributes: Record<string, unknown>,
  ownership: Record<string, Tier>,
  fields: Record<string, unknown>,
  as_tier: Tier,
): { skipped: string[]; written: string[] } {
  const skipped: string[] = [];
  const written: string[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const owner: Tier = ownership[field] ?? "raw";
    if (TIER_RANK[owner] <= TIER_RANK[as_tier]) {
      attributes[field] = value;
      ownership[field] = as_tier;
      written.push(field);
    } else {
      skipped.push(field);
    }
  }
  return { skipped, written };
}
