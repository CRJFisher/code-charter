import type { GraphStore, NodeRow } from "@code-charter/types";

import { DESCRIPTION_NODE_KIND, description_node_id } from "../agentic/write_descriptions";
import { CustomGraphModel } from "../model/custom_graph_model";
import {
  anchor_string_of,
  apply_raw_v1,
  apply_raw_v2,
  CALCULATE_V2,
  CODE_V2,
  COMPUTE_V1,
  symbol_path_of,
} from "../model/__fixtures__/round_trip_codebase";
import { module_group_id } from "../model/module_scaffold";
import { build_resolver_index, derive_code_state, format_anchor, parse_anchor } from "../resolver";
import type { ResolverSymbol } from "../resolver";
import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { re_extract } from "./re_extract";
import type { ReExtractDeps } from "./re_extract";

const DESCRIPTION = "the addition helper, agent-authored";
const FILE = "src/app.ts";
const OLD_DESC_ID = description_node_id(symbol_path_of(COMPUTE_V1));
const NEW_DESC_ID = description_node_id(symbol_path_of(CALCULATE_V2));
/** The rename-stable content hash shared by `compute` and `calculate` (identical bodies). */
const CONTENT_HASH = parse_anchor(anchor_string_of(COMPUTE_V1)).content_hash;

/** An agentic description side-node anchored to `compute`, shaped as `write_descriptions` persists it. */
function load_description(store: SqliteGraphStore): void {
  store.upsert_node({
    id: OLD_DESC_ID,
    kind: DESCRIPTION_NODE_KIND,
    path: FILE,
    anchor: anchor_string_of(COMPUTE_V1),
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "describe-policy",
    intent_source: "code-edit",
    deleted_at: null,
  } satisfies NodeRow);
  store.write_fields(
    { kind: "node", id: OLD_DESC_ID },
    { description: DESCRIPTION, description_hash: CONTENT_HASH, description_source: "llm" },
    "agentic",
  );
}

function deps(store: SqliteGraphStore): ReExtractDeps {
  return {
    store,
    extract_raw: (s: GraphStore) => apply_raw_v2(s),
    build_index: () => build_resolver_index(CODE_V2),
    analyzed_root: "src",
  };
}

describe("re_extract (AC#2/#3/#9)", () => {
  let store: SqliteGraphStore;

  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
    store.rebuild_layer("raw", apply_raw_v1);
    load_description(store);
  });

  afterEach(() => store.close());

  it("re-extracts the file's raw tier: the renamed symbol replaces the old one", () => {
    re_extract([FILE], "code-change", deps(store));
    expect(store.node(symbol_path_of(CALCULATE_V2))).toBeDefined();
    expect(store.node(symbol_path_of(COMPUTE_V1))).toBeUndefined();
  });

  it("reports exactly one relocated finding for the renamed leaf and re-anchors it inline", () => {
    const result = re_extract([FILE], "code-change", deps(store));

    const relocated = result.findings.filter((f) => f.reason === "relocated");
    expect(relocated).toHaveLength(1);
    expect(relocated[0].node_id).toBe(OLD_DESC_ID);
    expect(relocated[0].to_symbol_path).toBe(symbol_path_of(CALCULATE_V2));

    // Re-keyed to the new symbol_path in the same pass: no staged drift, no resolve step.
    const node = store.node(NEW_DESC_ID)!;
    expect(node.deleted_at).toBeNull();
    expect(parse_anchor(node.anchor!).symbol_path).toBe(symbol_path_of(CALCULATE_V2));
    expect(node.attributes.description).toBe(DESCRIPTION);
    expect(node.attributes.description_hash).toBe(CONTENT_HASH); // cache key rides across
    expect(node.attributes.drift_status).toBeUndefined();

    // The old-id row is retired so it never resolves as relocated again.
    expect(store.node(OLD_DESC_ID)).toBeUndefined();
    const retired = store.all_nodes({ include_deleted: true }).find((n) => n.id === OLD_DESC_ID);
    expect(retired?.deleted_at).not.toBeNull();
  });

  it("does not flag unrelated symbols (no false positives)", () => {
    const result = re_extract([FILE], "code-change", deps(store));
    // `main` resolves as a hit (unchanged symbol_path); only the renamed helper relocates.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].node_id).toBe(OLD_DESC_ID);
  });

  it("a non-description preserved node keeps its id and follows the anchor", () => {
    const BEHAVIOUR_ID = "agentic:behaviour:adder";
    store.upsert_node({
      id: BEHAVIOUR_ID,
      kind: "agentic.behaviour",
      path: FILE,
      anchor: anchor_string_of(COMPUTE_V1),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "fixture.agentic",
      intent_source: "diagram-edit",
      deleted_at: null,
    });

    re_extract([FILE], "code-change", deps(store));

    const node = store.node(BEHAVIOUR_ID)!;
    expect(node.deleted_at).toBeNull();
    expect(parse_anchor(node.anchor!).symbol_path).toBe(symbol_path_of(CALCULATE_V2));
  });

  it("the description rides across the rename in one step, visible in the render", () => {
    re_extract([FILE], "code-change", deps(store));

    const view = CustomGraphModel.hydrate(store).render([{ kind: "raw" }, { kind: "agentic" }, { kind: "user" }]);
    expect(view.hasNode(NEW_DESC_ID)).toBe(true);
    expect(view.hasNode(OLD_DESC_ID)).toBe(false);
    expect(parse_anchor(view.getNodeAttributes(NEW_DESC_ID).row.anchor!).symbol_path).toBe(symbol_path_of(CALCULATE_V2));
    expect(view.getNodeAttributes(NEW_DESC_ID).row.attributes.description).toBe(DESCRIPTION);
  });

  it("builds the file-module scaffold for the worked-on file's leaves (AC#9)", () => {
    re_extract([FILE], "code-change", deps(store));
    const group = store.node(module_group_id(FILE));
    expect(group?.kind).toBe("agentic.group");
    const contains = store.all_edges().filter((e) => e.kind === "agentic.contains" && e.dst_id === module_group_id(FILE));
    // one per current raw code leaf: `main` and the renamed `calculate` (the code.doc node is not a leaf)
    expect(contains).toHaveLength(2);
    expect(contains.map((e) => e.src_id)).toContain(symbol_path_of(CALCULATE_V2));
  });

  it("promotes the rename into the turn-level symbol delta as a relocation", () => {
    const result = re_extract([FILE], "code-change", deps(store));
    expect(result.delta.relocated).toContainEqual({
      from: symbol_path_of(COMPUTE_V1),
      to: symbol_path_of(CALCULATE_V2),
    });
  });

  it("soft-deletes a preserved node whose symbol is both renamed and re-bodied (miss)", () => {
    const gone: ResolverSymbol = { file_path: FILE, name: "gone", kind: "function", enclosing: [], body_source: "{\n  return 999;\n}" };
    const gone_state = derive_code_state(gone);
    const gone_id = description_node_id(gone_state.symbol_path);
    store.upsert_node({
      id: gone_id,
      kind: DESCRIPTION_NODE_KIND,
      path: FILE,
      anchor: format_anchor({ symbol_path: gone_state.symbol_path, content_hash: gone_state.content_hash }),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "describe-policy",
      intent_source: "code-edit",
      deleted_at: null,
    });
    store.write_fields({ kind: "node", id: gone_id }, { description: "describes gone" }, "agentic");

    const logs: string[] = [];
    const result = re_extract([FILE], "code-change", { ...deps(store), log: (m) => logs.push(m) });

    const miss = result.findings.find((f) => f.node_id === gone_id);
    expect(miss?.reason).toBe("miss");
    expect(miss?.to_symbol_path).toBeNull();
    expect(store.node(gone_id)).toBeUndefined();
    const retired = store.all_nodes({ include_deleted: true }).find((n) => n.id === gone_id);
    expect(retired?.deleted_at).not.toBeNull();
    expect(result.delta.removed).toContain(gone_state.symbol_path);
    expect(logs.some((m) => m.includes("soft-deleted"))).toBe(true);
  });

  it("logs a baseline conflict when two preserved nodes anchor one symbol with divergent hashes", () => {
    // A second preserved node on `compute`'s symbol_path but a divergent content_hash: the baseline is
    // first-wins, so the conflict must be logged loudly rather than silently narrowed.
    store.upsert_node({
      id: "agentic:behaviour:adder",
      kind: "agentic.behaviour",
      path: FILE,
      anchor: format_anchor({ symbol_path: symbol_path_of(COMPUTE_V1), content_hash: "b".repeat(64) }),
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "fixture.agentic",
      intent_source: "diagram-edit",
      deleted_at: null,
    });

    const logs: string[] = [];
    re_extract([FILE], "code-change", { ...deps(store), log: (m) => logs.push(m) });

    expect(logs.some((m) => m.includes("conflicting content_hash"))).toBe(true);
  });

  describe("same-pass relocation chains are order-independent (two-phase apply)", () => {
    const local_sym = (name: string, body: string): ResolverSymbol => ({
      file_path: FILE,
      name,
      kind: "function",
      enclosing: [],
      body_source: body,
    });
    const anchor_of = (s: ResolverSymbol): string => {
      const state = derive_code_state(s);
      return format_anchor({ symbol_path: state.symbol_path, content_hash: state.content_hash });
    };
    const path_of = (s: ResolverSymbol): string => derive_code_state(s).symbol_path;
    const load_desc = (s: ResolverSymbol, text: string): void => {
      const id = description_node_id(path_of(s));
      store.upsert_node({
        id,
        kind: DESCRIPTION_NODE_KIND,
        path: FILE,
        anchor: anchor_of(s),
        layer: "agentic",
        attributes: {},
        field_ownership: {},
        origin: "describe-policy",
        intent_source: "code-edit",
        deleted_at: null,
      });
      store.write_fields({ kind: "node", id }, { description: text }, "agentic");
    };
    const chain_deps = (code: ResolverSymbol[]): ReExtractDeps => ({
      store,
      extract_raw: () => {},
      build_index: () => build_resolver_index(code),
      analyzed_root: "src",
    });

    const A = local_sym("aaa", "{\n  return 101;\n}");
    const B = local_sym("bbb", "{\n  return 202;\n}");

    it("a relocation onto a body-changed twin's id never clobbers it (rename chain a→b, b→c)", () => {
      // After the chain, path bbb holds a's old body: desc(b) resolves body-changed (the cascade
      // prefers its own path) and stays put for re-description; desc(a)'s relocation onto the
      // occupied id is dropped, never upserted over the live twin.
      const B_WITH_A_BODY = local_sym("bbb", A.body_source);
      const C_WITH_B_BODY = local_sym("ccc", B.body_source);
      load_desc(A, "describes aaa");
      load_desc(B, "describes bbb");

      const result = re_extract([FILE], "code-change", chain_deps([B_WITH_A_BODY, C_WITH_B_BODY]));

      expect(store.node(description_node_id(path_of(B)))?.attributes.description).toBe("describes bbb");
      expect(store.node(description_node_id(path_of(A)))).toBeUndefined(); // relocating row retired
      expect(store.node(description_node_id(path_of(C_WITH_B_BODY)))).toBeUndefined(); // nothing relocated to ccc
      expect(result.findings.filter((f) => f.reason === "relocated").map((f) => f.node_id)).toEqual([
        description_node_id(path_of(A)),
      ]);
    });

    it("a relocation onto an already-described live hit never clobbers it", () => {
      const A_DUP = local_sym("aaa", B.body_source); // a's body now duplicates b's; a was deleted
      load_desc(A_DUP, "stale duplicate of bbb");
      load_desc(B, "describes bbb");

      re_extract([FILE], "code-change", chain_deps([B]));

      // desc(b) is a live hit at the target id; the relocating duplicate is retired, not upserted over it.
      expect(store.node(description_node_id(path_of(B)))?.attributes.description).toBe("describes bbb");
      expect(store.node(description_node_id(path_of(A_DUP)))).toBeUndefined();
    });
  });

  it("retires a renamed-away leaf's contains edge instead of orphaning it", () => {
    const compute = symbol_path_of(COMPUTE_V1);
    const calculate = symbol_path_of(CALCULATE_V2);

    // First reconcile builds the v1 scaffold (compute leaf -> module).
    re_extract([FILE], "code-change", {
      store,
      extract_raw: (s) => apply_raw_v1(s),
      build_index: () => build_resolver_index(CODE_V2),
      analyzed_root: "src",
    });
    expect(store.all_edges().some((e) => e.kind === "agentic.contains" && e.src_id === compute)).toBe(true);

    // Second reconcile renames compute -> calculate.
    re_extract([FILE], "code-change", deps(store));

    const live_contains = store.all_edges().filter((e) => e.kind === "agentic.contains");
    expect(live_contains.map((e) => e.src_id)).toContain(calculate);
    expect(live_contains.map((e) => e.src_id)).not.toContain(compute); // not left dangling live
    // the stale edge is soft-deleted (retired), not hard-removed
    const retired = store
      .all_edges({ include_deleted: true })
      .find((e) => e.kind === "agentic.contains" && e.src_id === compute);
    expect(retired?.deleted_at).not.toBeNull();
  });
});
