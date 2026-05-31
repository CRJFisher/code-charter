import type { GraphStore, NodeRow, ProvenanceRow } from "@code-charter/types";

import { derive_code_state, format_anchor } from "../../resolver";
import type { ResolverSymbol } from "../../resolver";

/**
 * A deterministic stand-in for the Ariadne extractor + agentic pass, for the task-27.0.4 AC#5
 * round-trip. Task-27.1 wires the real extractor; here a fixture emits a tiny, fully-controlled graph.
 *
 * The "codebase" is one file with two functions: `main` calls `compute`. Version 2 renames `compute`
 * to `calculate` with an identical body, so its `content_hash` is stable and the resolver resolves the
 * move as `relocated` (function bodies omit the symbol's own name on purpose, per the resolver's
 * rename-stable hashing). Preserved (agentic/user) content anchored to `compute` must follow that move.
 */

/** Stable ids for the preserved (non-raw) rows the round-trip tracks across the passes. */
export const BEHAVIOUR_ID = "agentic:behaviour:adder";
export const CONCEPT_ID = "user:concept:adder";
/** Stable ids/keys for the raw literal-doc node and the two raw edges the writer emits. */
export const DOC_ID = "src/app.ts#module-doc";
export const CALLS_EDGE_KEY = "src/app.ts#calls:main->helper";
export const DOC_EDGE_KEY = "src/app.ts#literal-doc:main->module-doc";

export const BEHAVIOUR_SUMMARY_V1 = "adds two numbers";
export const BEHAVIOUR_SUMMARY_V2 = "computes the sum of its two arguments";
/** The agentic-generated default for the concept's `description` at load (agentic-owned). */
export const CONCEPT_DESCRIPTION_DEFAULT = "the addition helper";
/** The value a user edit promotes `description` to (user-owned) — must survive the later agentic pass. */
export const CONCEPT_DESCRIPTION_USER = "adds its two arguments";
/** What the agentic pass tries to write over `description`; rejected by the ladder once user-owned. */
export const CONCEPT_DESCRIPTION_AGENTIC_ATTEMPT = "regenerated default";
export const USER_LABEL = "Adder";

// --- the two code versions ---------------------------------------------------

/** v1: the helper, named `compute`. */
export const COMPUTE_V1: ResolverSymbol = {
  file_path: "src/app.ts",
  name: "compute",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return a + b;\n}",
};

const MAIN_V1: ResolverSymbol = {
  file_path: "src/app.ts",
  name: "main",
  kind: "function",
  enclosing: [],
  body_source: "{\n  return compute(a, b);\n}",
};

/** v2: the same helper, renamed to `calculate` — identical body ⇒ identical `content_hash`. */
export const CALCULATE_V2: ResolverSymbol = { ...COMPUTE_V1, name: "calculate" };

const MAIN_V2: ResolverSymbol = { ...MAIN_V1, body_source: "{\n  return calculate(a, b);\n}" };

/** The current code symbols, as the resolver index is built from. */
export const CODE_V2: ResolverSymbol[] = [CALCULATE_V2, MAIN_V2];

// --- derivations -------------------------------------------------------------

/** The stored anchor string (`symbol_path:content_hash`) a symbol is tracked by. */
export function anchor_string_of(symbol: ResolverSymbol): string {
  const state = derive_code_state(symbol);
  return format_anchor({ symbol_path: state.symbol_path, content_hash: state.content_hash });
}

export function symbol_path_of(symbol: ResolverSymbol): string {
  return derive_code_state(symbol).symbol_path;
}

// --- the fixture raw writer (stands in for the Ariadne extractor) ------------

function raw_function_node(symbol: ResolverSymbol): NodeRow {
  return {
    id: symbol_path_of(symbol),
    kind: "code.function",
    path: symbol.file_path,
    anchor: anchor_string_of(symbol),
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "fixture.raw",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

function provenance(edge_key: string): ProvenanceRow[] {
  return [{ edge_key, source_file: "src/app.ts", source_range: "1:0-1:0", extractor_id: "fixture", extractor_version: "1" }];
}

/**
 * Emit the raw tier for one code version: the two function nodes, a literal-doc node, a `code.calls`
 * edge (`main` → helper) and a `code.literal-doc` edge (`main` → doc), all raw-tier with provenance.
 * The edge keys are stable across versions; the call edge re-points to the (possibly renamed) helper.
 */
function write_raw_tier(s: GraphStore, caller: ResolverSymbol, helper: ResolverSymbol): void {
  s.upsert_node(raw_function_node(caller));
  s.upsert_node(raw_function_node(helper));
  s.upsert_node({
    id: DOC_ID,
    kind: "code.doc",
    path: "src/app.ts",
    anchor: null,
    layer: "raw",
    attributes: { text: "module documentation" },
    field_ownership: {},
    origin: "fixture.raw",
    intent_source: "code-edit",
    deleted_at: null,
  });
  s.upsert_edge(
    {
      key: CALLS_EDGE_KEY,
      src_id: symbol_path_of(caller),
      dst_id: symbol_path_of(helper),
      kind: "code.calls",
      confidence: 1,
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: "fixture.raw",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    },
    provenance(CALLS_EDGE_KEY),
  );
  s.upsert_edge(
    {
      key: DOC_EDGE_KEY,
      src_id: symbol_path_of(caller),
      dst_id: DOC_ID,
      kind: "code.literal-doc",
      confidence: 1,
      layer: "raw",
      attributes: {},
      field_ownership: {},
      origin: "fixture.raw",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    },
    provenance(DOC_EDGE_KEY),
  );
}

/** Raw re-parse writers, one per version — passed as the `rebuild_layer('raw', …)` callback. */
export function apply_raw_v1(s: GraphStore): void {
  write_raw_tier(s, MAIN_V1, COMPUTE_V1);
}
export function apply_raw_v2(s: GraphStore): void {
  write_raw_tier(s, MAIN_V2, CALCULATE_V2);
}

// --- preserved tiers + the agentic pass --------------------------------------

/**
 * Load the agentic and user tiers, both anchored to `compute` (the symbol that later moves):
 * an agentic-layer behaviour node with an agentic-owned `summary`, and a user-layer concept node whose
 * `description` is an agentic-owned default (dual-sourced — a user edit can later promote it).
 */
export function load_preserved_tiers(s: GraphStore): void {
  s.upsert_node({
    id: BEHAVIOUR_ID,
    kind: "agentic.behaviour",
    path: "src/app.ts",
    anchor: anchor_string_of(COMPUTE_V1),
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "fixture.agentic",
    intent_source: "diagram-edit",
    deleted_at: null,
  });
  s.write_fields({ kind: "node", id: BEHAVIOUR_ID }, { summary: BEHAVIOUR_SUMMARY_V1 }, "agentic");

  s.upsert_node({
    id: CONCEPT_ID,
    kind: "user.concept",
    path: "src/app.ts",
    anchor: anchor_string_of(COMPUTE_V1),
    layer: "user",
    attributes: {},
    field_ownership: {},
    origin: "fixture.user",
    intent_source: "explicit-pin",
    deleted_at: null,
  });
  s.write_fields({ kind: "node", id: CONCEPT_ID }, { description: CONCEPT_DESCRIPTION_DEFAULT }, "agentic");
}

/**
 * The agentic pass (task-27.1 runs the real one). Re-emits the behaviour node anchored to the current
 * code, and rewrites the concept's `description` at agentic tier — the ladder skips the user-owned
 * `label`, so the user edit is preserved while the agentic default is regenerated.
 */
export function apply_agentic_pass(s: GraphStore): void {
  s.upsert_node({
    id: BEHAVIOUR_ID,
    kind: "agentic.behaviour",
    path: "src/app.ts",
    anchor: anchor_string_of(CALCULATE_V2),
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "fixture.agentic",
    intent_source: "diagram-edit",
    deleted_at: null,
  });
  s.write_fields({ kind: "node", id: BEHAVIOUR_ID }, { summary: BEHAVIOUR_SUMMARY_V2 }, "agentic");
  s.write_fields(
    { kind: "node", id: CONCEPT_ID },
    { description: CONCEPT_DESCRIPTION_AGENTIC_ATTEMPT, label: "agentic-label-attempt" },
    "agentic",
  );
}
