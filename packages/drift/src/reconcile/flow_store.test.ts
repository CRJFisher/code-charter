import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import {
  BRIDGE_EDGE_KIND,
  build_flow_node,
  type EdgeRow,
  type GraphStore,
  open_graph_store,
} from "@code-charter/core";

import {
  is_skill_flow_id,
  type PersistedFlow,
  read_persisted_flow,
  read_persisted_flows,
  skill_flow_id,
  stored_seed_files,
  stored_seed_paths,
  stored_skill_root,
  write_flow,
} from "./flow_store";

const SEED_A = "src/a.ts#a:function";
const SEED_B = "src/b.ts#b:function";

function flow_with_entry_points(entry_points: unknown): PersistedFlow {
  const node = build_flow_node({
    id: "f",
    label: "f",
    entry_points: [],
    exit_points: [],
    rationale: "r",
  });
  node.attributes.entry_points = entry_points;
  return { node, member_edges: [], bridge_edges: [] };
}

describe("stored_seed_paths", () => {
  it("returns the stored string seed paths", () => {
    expect(stored_seed_paths(flow_with_entry_points([SEED_A, SEED_B]))).toEqual([SEED_A, SEED_B]);
  });

  it("returns an empty list when entry_points is not an array", () => {
    expect(stored_seed_paths(flow_with_entry_points(undefined))).toEqual([]);
    expect(stored_seed_paths(flow_with_entry_points("not-an-array"))).toEqual([]);
  });

  it("drops non-string elements from the agent-authored array", () => {
    expect(stored_seed_paths(flow_with_entry_points([SEED_A, 42, null, { x: 1 }, SEED_B]))).toEqual([SEED_A, SEED_B]);
  });
});

describe("skill flow id namespace", () => {
  it("round-trips a skill name through a namespaced flow id", () => {
    expect(is_skill_flow_id(skill_flow_id("myskill"))).toBe(true);
  });

  it("does not classify a code flow id as a skill flow", () => {
    expect(is_skill_flow_id(SEED_A)).toBe(false);
  });
});

describe("stored_skill_root", () => {
  it("returns the stored repo-relative bundle dir", () => {
    const flow = flow_with_entry_points([]);
    flow.node.attributes.skill_root = "skills/myskill";
    expect(stored_skill_root(flow)).toBe("skills/myskill");
  });

  it("returns undefined when the attribute is absent or not a string", () => {
    expect(stored_skill_root(flow_with_entry_points([]))).toBeUndefined();
    const flow = flow_with_entry_points([]);
    flow.node.attributes.skill_root = 42;
    expect(stored_skill_root(flow)).toBeUndefined();
  });
});

describe("stored_seed_files", () => {
  it("maps each seed path to its defining repo-relative file", () => {
    expect(stored_seed_files(flow_with_entry_points([SEED_A, SEED_B]))).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("dedupes files shared by multiple seeds in the same file", () => {
    expect(stored_seed_files(flow_with_entry_points([SEED_A, "src/a.ts#other:function"]))).toEqual(["src/a.ts"]);
  });

  it("skips seed paths without a '#' file separator instead of throwing", () => {
    expect(stored_seed_files(flow_with_entry_points([SEED_A, "no-file-separator"]))).toEqual(["src/a.ts"]);
  });
});

describe("write_flow", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = open_graph_store(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("persists a flow that reads back with its seeds, members, rationale, and sync time", () => {
    write_flow(store, {
      id: SEED_A,
      label: "Flow A",
      seed_paths: [SEED_A],
      member_ids: ["src/doc.md#doc"],
      rationale: "because",
      anchor_set: [SEED_A, SEED_B],
      last_synced_at: "2026-01-01T00:00:00Z",
    });

    const flow = read_persisted_flow(store, SEED_A)!;
    expect(flow.node.id).toBe(SEED_A);
    expect(flow.node.attributes.label).toBe("Flow A");
    expect(flow.node.attributes.entry_points).toEqual([SEED_A]);
    expect(flow.node.attributes.rationale).toBe("because");
    expect(flow.node.attributes.last_synced_at).toBe("2026-01-01T00:00:00Z");
    expect(flow.member_edges.map((e) => e.dst_id)).toEqual(["src/doc.md#doc"]);
  });

  it("stores a sorted anchor_set and a member_count equal to its size", () => {
    write_flow(store, {
      id: SEED_A,
      label: "Flow A",
      seed_paths: [SEED_A],
      member_ids: [],
      rationale: "r",
      anchor_set: [SEED_B, SEED_A],
      last_synced_at: "t",
    });

    const flow = read_persisted_flow(store, SEED_A)!;
    expect(flow.node.attributes.anchor_set).toEqual([SEED_A, SEED_B]);
    expect(flow.node.attributes.member_count).toBe(2);
  });

  it("retires member edges no longer present on a re-sync", () => {
    const base = {
      id: SEED_A,
      label: "Flow A",
      seed_paths: [SEED_A],
      rationale: "r",
      anchor_set: [SEED_A],
      last_synced_at: "t",
    };
    write_flow(store, { ...base, member_ids: ["m1", "m2"] });
    write_flow(store, { ...base, member_ids: ["m2", "m3"] });

    const flow = read_persisted_flow(store, SEED_A)!;
    expect(flow.member_edges.map((e) => e.dst_id).sort()).toEqual(["m2", "m3"]);
  });

  it("persists a skill flow's skill_root and reads it back", () => {
    write_flow(store, {
      id: skill_flow_id("myskill"),
      label: "Skill",
      seed_paths: [],
      member_ids: ["skills/myskill/agents/reviewer.md#doc"],
      rationale: "r",
      anchor_set: [],
      last_synced_at: "t",
      skill_root: "skills/myskill",
    });

    const flow = read_persisted_flow(store, skill_flow_id("myskill"))!;
    expect(stored_skill_root(flow)).toBe("skills/myskill");
  });

  it("omits skill_root for a code flow", () => {
    write_flow(store, {
      id: SEED_A,
      label: "Flow A",
      seed_paths: [SEED_A],
      member_ids: [],
      rationale: "r",
      anchor_set: [SEED_A],
      last_synced_at: "t",
    });

    expect(stored_skill_root(read_persisted_flow(store, SEED_A)!)).toBeUndefined();
  });

  it("re-running with identical input is an idempotent replace", () => {
    const args = {
      id: SEED_A,
      label: "Flow A",
      seed_paths: [SEED_A],
      member_ids: ["m1"],
      rationale: "r",
      anchor_set: [SEED_A],
      last_synced_at: "t",
    };
    write_flow(store, args);
    write_flow(store, args);

    const flow = read_persisted_flow(store, SEED_A)!;
    expect(flow.member_edges.map((e) => e.dst_id)).toEqual(["m1"]);
  });
});

describe("read_persisted_flows", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = open_graph_store(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  function write(id: string, member_ids: readonly string[]): void {
    write_flow(store, {
      id,
      label: id,
      seed_paths: [id],
      member_ids,
      rationale: "r",
      anchor_set: [id],
      last_synced_at: "t",
    });
  }

  it("returns every live persisted flow", () => {
    write(SEED_A, []);
    write(SEED_B, []);
    expect(read_persisted_flows(store).map((f) => f.node.id).sort()).toEqual([SEED_A, SEED_B]);
  });

  it("excludes a soft-deleted flow node", () => {
    write(SEED_A, []);
    write(SEED_B, []);
    store.soft_delete({ kind: "node", id: SEED_A });
    expect(read_persisted_flows(store).map((f) => f.node.id)).toEqual([SEED_B]);
  });

  it("surfaces a bridge edge incident to a member", () => {
    write(SEED_A, ["m1"]);
    const bridge: EdgeRow = {
      key: `${BRIDGE_EDGE_KIND}:m1->m2`,
      src_id: "m1",
      dst_id: "m2",
      kind: BRIDGE_EDGE_KIND,
      confidence: 1,
      layer: "agentic",
      attributes: {},
      field_ownership: {},
      origin: "flow-detector",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    };
    store.upsert_edge(bridge, []);

    const flow = read_persisted_flows(store).find((f) => f.node.id === SEED_A)!;
    expect(flow.bridge_edges.map((e) => e.key)).toEqual([bridge.key]);
  });
});

describe("read_persisted_flow", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = open_graph_store(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("returns undefined for an unknown flow id", () => {
    expect(read_persisted_flow(store, "nope")).toBeUndefined();
  });

  it("returns undefined for a soft-deleted flow", () => {
    write_flow(store, {
      id: SEED_A,
      label: "A",
      seed_paths: [SEED_A],
      member_ids: [],
      rationale: "r",
      anchor_set: [SEED_A],
      last_synced_at: "t",
    });
    store.soft_delete({ kind: "node", id: SEED_A });
    expect(read_persisted_flow(store, SEED_A)).toBeUndefined();
  });
});
