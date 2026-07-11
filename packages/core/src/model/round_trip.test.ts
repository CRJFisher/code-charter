import type { GraphStore, NodeRow } from "@code-charter/types";

import { build_resolver_index, format_anchor, parse_anchor, resolve_anchor } from "../resolver";
import type { ResolverIndex } from "../resolver";
import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { CustomGraphModel } from "./custom_graph_model";
import {
  apply_agentic_pass,
  apply_raw_v1,
  apply_raw_v2,
  BEHAVIOUR_ID,
  BEHAVIOUR_SUMMARY_V1,
  BEHAVIOUR_SUMMARY_V2,
  CALCULATE_V2,
  CALLS_EDGE_KEY,
  CODE_V2,
  COMPUTE_V1,
  CONCEPT_DESCRIPTION_DEFAULT,
  CONCEPT_DESCRIPTION_USER,
  CONCEPT_ID,
  DOC_EDGE_KEY,
  DOC_ID,
  load_preserved_tiers,
  symbol_path_of,
  USER_LABEL,
} from "./__fixtures__/round_trip_codebase";

/**
 * Re-anchor every preserved (non-raw) row whose anchored symbol moved, by asking the resolver where
 * its anchor now resolves. This is the minimal "follow the rename" wiring the round-trip needs — the
 * full repair policy (a relocation re-anchors inline; a miss soft-deletes, with agentic content
 * regenerated on a later sync) is `re_extract`'s. On a `relocated` downgrade the row's `anchor` is
 * rewritten to the new code state; `hit`/`body-changed`/`miss` rows are left untouched, so content
 * is never dropped here.
 */
function reanchor_preserved_rows(store: GraphStore, index: ResolverIndex): void {
  for (const node of store.all_nodes()) {
    if (node.layer === "raw" || node.anchor === null) continue;
    const result = resolve_anchor(parse_anchor(node.anchor), index);
    if (result.status === "downgrade" && result.reason === "relocated") {
      const reanchored: NodeRow = {
        ...node,
        anchor: format_anchor({ symbol_path: result.state.symbol_path, content_hash: result.state.content_hash }),
      };
      store.upsert_node(reanchored);
    }
  }
}

describe("end-to-end round-trip on :memory:", () => {
  let store: SqliteGraphStore;

  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("load → user edit → raw re-parse (moved symbol) → agentic pass: tiers preserved and re-anchored", () => {
    const compute_path = symbol_path_of(COMPUTE_V1);
    const calculate_path = symbol_path_of(CALCULATE_V2);

    // --- load: raw v1 (code + literal-doc edges) + agentic + user tiers, anchored to `compute` ---
    store.rebuild_layer("raw", apply_raw_v1);
    load_preserved_tiers(store);

    expect(store.node(compute_path)).toBeDefined(); // raw v1 has the helper under its original name
    expect(parse_anchor(store.node(BEHAVIOUR_ID)!.anchor!).symbol_path).toBe(compute_path);
    expect(parse_anchor(store.node(CONCEPT_ID)!.anchor!).symbol_path).toBe(compute_path);

    // --- user edit through the model: add a user-owned label, and PROMOTE the dual-sourced
    // `description` (an agentic default) to user-owned. Both must survive the later agentic pass. ---
    const editing = CustomGraphModel.hydrate(store);
    const edit = editing.write_fields(
      { kind: "node", id: CONCEPT_ID },
      { label: USER_LABEL, description: CONCEPT_DESCRIPTION_USER },
      "user",
    );
    expect(edit.skipped).toEqual([]); // label is new; description was agentic-owned, so user wins
    editing.flush();
    expect(store.node(CONCEPT_ID)?.attributes.label).toBe(USER_LABEL);
    expect(store.node(CONCEPT_ID)?.field_ownership.description).toBe("user");

    // --- raw re-parse: `compute` renamed to `calculate`; raw rows replaced, tiers survive ---
    store.rebuild_layer("raw", apply_raw_v2);

    // The new raw graph is v2: calculate present, compute gone, edges re-pointed.
    expect(store.node(calculate_path)).toBeDefined();
    expect(store.node(compute_path)).toBeUndefined();
    const calls_edge = store.all_edges().find((e) => e.key === CALLS_EDGE_KEY);
    expect(calls_edge?.dst_id).toBe(calculate_path);
    expect(store.all_edges().some((e) => e.key === DOC_EDGE_KEY)).toBe(true);

    // Preserved tiers survived the raw nuke, but still carry the stale `compute` anchor + the user edit.
    expect(store.node(BEHAVIOUR_ID)?.attributes.summary).toBe(BEHAVIOUR_SUMMARY_V1);
    expect(store.node(CONCEPT_ID)?.attributes.label).toBe(USER_LABEL);
    expect(parse_anchor(store.node(CONCEPT_ID)!.anchor!).symbol_path).toBe(compute_path);

    // --- re-anchor preserved rows through the resolver: follow the moved symbol ---
    const index = build_resolver_index(CODE_V2);
    reanchor_preserved_rows(store, index);

    expect(parse_anchor(store.node(BEHAVIOUR_ID)!.anchor!).symbol_path).toBe(calculate_path);
    expect(parse_anchor(store.node(CONCEPT_ID)!.anchor!).symbol_path).toBe(calculate_path);

    // --- agentic pass through the ladder: regenerate agentic content; user edit is protected ---
    store.rebuild_layer("agentic", apply_agentic_pass);

    // --- final composition through the model ---
    const model = CustomGraphModel.hydrate(store);
    const view = model.render([{ kind: "raw" }, { kind: "agentic" }, { kind: "user" }]);

    // Raw tier reflects v2: the renamed helper and the doc node are present, the old name is gone, and
    // both raw edges compose (the calls edge surviving implies `main` is present — render drops edges
    // with a missing endpoint).
    expect(view.hasNode(calculate_path)).toBe(true);
    expect(view.hasNode(compute_path)).toBe(false);
    expect(view.hasNode(DOC_ID)).toBe(true);
    expect(view.hasEdge(CALLS_EDGE_KEY)).toBe(true);
    expect(view.hasEdge(DOC_EDGE_KEY)).toBe(true);

    // Agentic tier was regenerated and now anchors to the moved symbol.
    const behaviour = view.getNodeAttributes(BEHAVIOUR_ID).row;
    expect(behaviour.attributes.summary).toBe(BEHAVIOUR_SUMMARY_V2);
    expect(parse_anchor(behaviour.anchor!).symbol_path).toBe(calculate_path);

    // User tier survived both passes: the user-owned label AND the user-promoted (dual-sourced)
    // description were both protected by the ladder when the agentic pass tried to overwrite them; the
    // anchor followed the move via the resolver. (Agentic regeneration is shown by behaviour.summary.)
    const concept = view.getNodeAttributes(CONCEPT_ID).row;
    expect(concept.attributes.label).toBe(USER_LABEL);
    expect(concept.attributes.description).toBe(CONCEPT_DESCRIPTION_USER);
    expect(parse_anchor(concept.anchor!).symbol_path).toBe(calculate_path);
  });

  it("a missed anchor (symbol renamed AND re-bodied) is left intact, not dropped", () => {
    // Load a user row anchored to `compute`, then re-parse into a v2 where the helper is both renamed
    // and re-bodied — neither symbol_path nor content_hash survives, so the resolver reports `miss`.
    store.rebuild_layer("raw", apply_raw_v1);
    load_preserved_tiers(store);
    const original_anchor = store.node(CONCEPT_ID)!.anchor;

    const renamed_and_rebodied = { ...CALCULATE_V2, body_source: "{\n  return a * b;\n}" };
    const index = build_resolver_index([renamed_and_rebodied]);
    expect(resolve_anchor(parse_anchor(original_anchor!), index).status).toBe("miss");

    reanchor_preserved_rows(store, index);

    // Preserved content is untouched on a miss (anchor AND attributes intact); repair of a true miss
    // belongs to the re_extract policy — the round-trip only follows a `relocated`.
    expect(store.node(CONCEPT_ID)?.anchor).toBe(original_anchor);
    expect(store.node(CONCEPT_ID)?.attributes.description).toBe(CONCEPT_DESCRIPTION_DEFAULT);
  });
});
