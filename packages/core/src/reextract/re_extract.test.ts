import type { GraphStore, NodeRow } from "@code-charter/types";

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
import { build_resolver_index, parse_anchor } from "../resolver";
import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { DRIFT_STATUS_KEY, outstanding_drift } from "./drift_observation";
import { reanchor_node } from "./reanchor";
import { re_extract } from "./re_extract";
import type { ReExtractDeps } from "./re_extract";

const DESC_ID = "user:description:helper";
const DESCRIPTION = "the addition helper, by hand";
const FILE = "src/app.ts";

/** A user description node, anchored to `compute`, with a user-owned `description`. */
function load_user_description(store: SqliteGraphStore): void {
  store.upsert_node({
    id: DESC_ID,
    kind: "user.description",
    path: FILE,
    anchor: anchor_string_of(COMPUTE_V1),
    layer: "agentic",
    attributes: {},
    field_ownership: {},
    origin: "test.user",
    intent_source: "explicit-pin",
    deleted_at: null,
  } satisfies NodeRow);
  // The user hand-writes the description; AC#1 promotes the node to layer='user'.
  store.write_fields({ kind: "node", id: DESC_ID }, { description: DESCRIPTION }, "user");
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
    load_user_description(store);
  });

  afterEach(() => store.close());

  it("re-extracts the file's raw tier: the renamed symbol replaces the old one", () => {
    re_extract([FILE], "code-change", deps(store));
    expect(store.node(symbol_path_of(CALCULATE_V2))).toBeDefined();
    expect(store.node(symbol_path_of(COMPUTE_V1))).toBeUndefined();
  });

  it("reports exactly one relocated finding for the renamed leaf and stages it as outstanding drift", () => {
    const result = re_extract([FILE], "code-change", deps(store));

    const relocated = result.findings.filter((f) => f.reason === "relocated");
    expect(relocated).toHaveLength(1);
    expect(relocated[0].node_id).toBe(DESC_ID);
    expect(relocated[0].to_symbol_path).toBe(symbol_path_of(CALCULATE_V2));

    const drift = outstanding_drift(store);
    expect(drift).toHaveLength(1);
    expect(drift[0].node_id).toBe(DESC_ID);
    expect(drift[0].to_symbol_path).toBe(symbol_path_of(CALCULATE_V2));
  });

  it("does not flag unrelated symbols (no false positives)", () => {
    re_extract([FILE], "code-change", deps(store));
    // `main` resolves as a hit (unchanged symbol_path); only the renamed helper drifts.
    const drift = outstanding_drift(store);
    expect(drift).toHaveLength(1);
    expect(drift.map((d) => d.node_id)).not.toContain(symbol_path_of(CALCULATE_V2));
  });

  it("leaves the preserved description live and untouched while drift is outstanding", () => {
    re_extract([FILE], "code-change", deps(store));
    const node = store.node(DESC_ID)!;
    expect(node.deleted_at).toBeNull();
    expect(node.layer).toBe("user");
    expect(node.attributes.description).toBe(DESCRIPTION);
    // still anchored to the OLD symbol until the re-anchor is accepted
    expect(parse_anchor(node.anchor!).symbol_path).toBe(symbol_path_of(COMPUTE_V1));
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

  it("accepting the re-anchor moves the description onto the renamed symbol, untouched", () => {
    re_extract([FILE], "code-change", deps(store));
    const drift = outstanding_drift(store)[0];
    const node = store.node(drift.node_id)!;

    reanchor_node(store, node, { symbol_path: drift.to_symbol_path, content_hash: drift.to_content_hash });

    const reanchored = store.node(DESC_ID)!;
    expect(parse_anchor(reanchored.anchor!).symbol_path).toBe(symbol_path_of(CALCULATE_V2));
    expect(reanchored.attributes.description).toBe(DESCRIPTION);
    expect(reanchored.field_ownership.description).toBe("user");
    expect(reanchored.attributes[DRIFT_STATUS_KEY]).toBeUndefined();
    expect(outstanding_drift(store)).toHaveLength(0);

    // the re-render shows the description anchored to the renamed symbol
    const view = CustomGraphModel.hydrate(store).render([{ kind: "raw" }, { kind: "agentic" }, { kind: "user" }]);
    expect(view.hasNode(DESC_ID)).toBe(true);
    expect(parse_anchor(view.getNodeAttributes(DESC_ID).row.anchor!).symbol_path).toBe(symbol_path_of(CALCULATE_V2));
    expect(view.getNodeAttributes(DESC_ID).row.attributes.description).toBe(DESCRIPTION);
  });
});
