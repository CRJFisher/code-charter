import { describe, expect, it } from "@jest/globals";

import {
  CALCULATE_V2,
  COMPUTE_V1,
  symbol_path_of,
} from "../model/__fixtures__/round_trip_codebase";
import { build_resolver_index, derive_code_state } from "../resolver";
import type { ResolverSymbol } from "../resolver";
import { compute_symbol_delta } from "./symbol_delta";

/**
 * `compute_symbol_delta` is the aggregate promotion of `resolve_anchor`'s per-anchor verdicts (the same
 * cascade `reconcile_node` runs for description preservation), surfaced as a turn-level change set. These
 * tests pin each delta class — added / removed / modified / relocated — against a fixture extraction.
 */

/** A `compute` whose body differs from {@link COMPUTE_V1} (same symbol_path) — a body-modify, not a rename. */
const COMPUTE_REBODIED: ResolverSymbol = { ...COMPUTE_V1, body_source: "{\n  return a * b;\n}" };

/** A symbol with a unique body shared by nothing — its disappearance is a true `miss`, not a relocation. */
const GONE: ResolverSymbol = {
  file_path: "src/app.ts",
  name: "gone",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return 999;\n}",
};

/** symbol_path → content_hash baseline, as `re_extract` builds it from persisted anchors. */
function baseline_of(...symbols: ResolverSymbol[]): Map<string, string> {
  const baseline = new Map<string, string>();
  for (const symbol of symbols) {
    const state = derive_code_state(symbol);
    baseline.set(state.symbol_path, state.content_hash);
  }
  return baseline;
}

describe("compute_symbol_delta (AC#1)", () => {
  it("reports an added symbol: fresh symbol_path with no baseline anchor", () => {
    const baseline = baseline_of(COMPUTE_V1);
    const index = build_resolver_index([COMPUTE_V1, CALCULATE_V2]); // calculate is new this turn

    const delta = compute_symbol_delta(baseline, index);

    expect(delta.added).toEqual([symbol_path_of(CALCULATE_V2)]);
    expect(delta.removed).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.relocated).toEqual([]);
  });

  it("reports a removed symbol: a baseline anchor that resolves nowhere", () => {
    const baseline = baseline_of(COMPUTE_V1, GONE);
    // `compute` survives; `gone`'s body exists nowhere now → a true miss (not a relocation).
    const index = build_resolver_index([COMPUTE_V1]);

    const delta = compute_symbol_delta(baseline, index);

    expect(delta.removed).toEqual([symbol_path_of(GONE)]);
    expect(delta.added).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.relocated).toEqual([]);
  });

  it("reports a modified symbol: same symbol_path, changed body", () => {
    const baseline = baseline_of(COMPUTE_V1);
    const index = build_resolver_index([COMPUTE_REBODIED]);

    const delta = compute_symbol_delta(baseline, index);

    expect(delta.modified).toEqual([symbol_path_of(COMPUTE_V1)]);
    expect(delta.relocated).toEqual([]);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("reports a relocated symbol and excludes its new path from `added`", () => {
    const baseline = baseline_of(COMPUTE_V1);
    // compute → calculate, identical body ⇒ identical content_hash ⇒ the resolver's relocated verdict.
    const index = build_resolver_index([CALCULATE_V2]);

    const delta = compute_symbol_delta(baseline, index);

    expect(delta.relocated).toEqual([
      { from: symbol_path_of(COMPUTE_V1), to: symbol_path_of(CALCULATE_V2) },
    ]);
    // The relocation target is reported as `to`, never double-counted as `added`.
    expect(delta.added).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("is empty when the fresh code matches every baseline anchor (a hit-only turn)", () => {
    const baseline = baseline_of(COMPUTE_V1, CALCULATE_V2);
    const index = build_resolver_index([COMPUTE_V1, CALCULATE_V2]);

    const delta = compute_symbol_delta(baseline, index);

    expect(delta).toEqual({ added: [], removed: [], modified: [], relocated: [] });
  });
});
