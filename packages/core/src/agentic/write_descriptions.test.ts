import type { GraphStore } from "@code-charter/types";

import {
  anchor_string_of,
  apply_raw_v1,
  apply_raw_v2,
  CALCULATE_V2,
  CODE_V2,
  COMPUTE_V1,
  symbol_path_of,
} from "../model/__fixtures__/round_trip_codebase";
import { build_resolver_index, parse_anchor } from "../resolver";
import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { re_extract } from "../reextract/re_extract";
import type { ReExtractDeps } from "../reextract/re_extract";
import { description_node_id, write_descriptions } from "./write_descriptions";
import type { ResolvedDescription } from "./write_descriptions";

const FILE = "src/app.ts";

function content_hash_of(symbol: typeof COMPUTE_V1): string {
  return parse_anchor(anchor_string_of(symbol)).content_hash;
}

function description_for(symbol: typeof COMPUTE_V1, text: string): ResolvedDescription {
  return { symbol_path: symbol_path_of(symbol), content_hash: content_hash_of(symbol), file_path: FILE, text, source: "docstring" };
}

function v2_deps(store: GraphStore): ReExtractDeps {
  return {
    store,
    extract_raw: (s) => apply_raw_v2(s),
    build_index: () => build_resolver_index(CODE_V2),
    analyzed_root: "src",
  };
}

describe("write_descriptions (AC#3)", () => {
  let store: SqliteGraphStore;
  beforeEach(() => {
    store = new SqliteGraphStore(":memory:");
    store.rebuild_layer("raw", apply_raw_v1);
  });
  afterEach(() => store.close());

  it("writes an agentic.description side-node with the content-hash cache key", () => {
    const result = write_descriptions(store, [description_for(COMPUTE_V1, "adds two numbers")]);
    expect(result.written).toEqual([symbol_path_of(COMPUTE_V1)]);
    const node = store.node(description_node_id(symbol_path_of(COMPUTE_V1)))!;
    expect(node.layer).toBe("agentic");
    expect(node.attributes.description).toBe("adds two numbers");
    expect(node.attributes.description_hash).toBe(content_hash_of(COMPUTE_V1));
    expect(node.field_ownership.description).toBe("agentic");
  });

  it("resurrects a soft-deleted side-node and overwrites its content (descriptions are agent-generated)", () => {
    write_descriptions(store, [description_for(COMPUTE_V1, "first")]);
    const id = description_node_id(symbol_path_of(COMPUTE_V1));
    store.soft_delete({ kind: "node", id });

    const result = write_descriptions(store, [description_for(COMPUTE_V1, "regenerated")]);
    expect(result.written).toContain(symbol_path_of(COMPUTE_V1));
    const node = store.node(id)!;
    expect(node.deleted_at).toBeNull(); // resurrected live, not left binned
    expect(node.layer).toBe("agentic");
    expect(node.attributes.description).toBe("regenerated"); // overwritten with the fresh text
  });

  it("survives re-extraction of its file and rides across a rename inline", () => {
    write_descriptions(store, [description_for(COMPUTE_V1, "adds two numbers")]);
    const old_id = description_node_id(symbol_path_of(COMPUTE_V1));

    const result = re_extract([FILE], "code-change", v2_deps(store));

    // The raw node was rebuilt (compute → calculate) ...
    expect(store.node(symbol_path_of(CALCULATE_V2))).toBeDefined();
    expect(store.node(symbol_path_of(COMPUTE_V1))).toBeUndefined();
    // ... and the description side-node was re-keyed to the renamed symbol with its text intact.
    const desc = store.node(description_node_id(symbol_path_of(CALCULATE_V2)))!;
    expect(desc).toBeDefined();
    expect(desc.attributes.description).toBe("adds two numbers");
    expect(desc.attributes.description_hash).toBe(content_hash_of(CALCULATE_V2)); // cache key intact
    expect(store.node(old_id)).toBeUndefined();
    expect(result.findings.some((f) => f.node_id === old_id && f.reason === "relocated")).toBe(true);
  });
});
