import { describe, expect, it } from "@jest/globals";

import type { NodeRow } from "@code-charter/core";
import { FLOW_NODE_KIND } from "@code-charter/core";

import { anchor_set_hash, match_existing_flow } from "./flow_identity";
import type { PersistedFlow } from "./flow_store";

function flow(id: string, anchor_set: string[]): PersistedFlow {
  const node: NodeRow = {
    id,
    kind: FLOW_NODE_KIND,
    path: "",
    anchor: null,
    layer: "agentic",
    attributes: { anchor_set },
    field_ownership: {},
    origin: "flow-detector",
    intent_source: "code-edit",
    deleted_at: null,
  };
  return { node, member_edges: [], bridge_edges: [] };
}

describe("anchor_set_hash", () => {
  it("is order-independent and stable", () => {
    expect(anchor_set_hash(["b", "a", "c"])).toBe(anchor_set_hash(["a", "b", "c"]));
  });
  it("changes when the member set changes", () => {
    expect(anchor_set_hash(["a", "b"])).not.toBe(anchor_set_hash(["a", "b", "c"]));
  });
});

describe("match_existing_flow (AC#9 remap)", () => {
  const persisted = [
    flow("old.ts#run:function", ["a", "b", "c", "d"]),
    flow("other.ts#go:function", ["x", "y", "z"]),
  ];

  it("matches a renamed flow with >=50% member overlap, ignoring same-id", () => {
    // 3 of 4 old members carry over → Jaccard 3/5 = 0.6 >= 0.5.
    const match = match_existing_flow("new.ts#run:function", ["a", "b", "c", "e"], persisted);
    expect(match?.flow.node.id).toBe("old.ts#run:function");
    expect(match?.overlap).toBeGreaterThanOrEqual(0.5);
  });

  it("does not match a weak overlap (a genuine split/merge)", () => {
    // 1 of 4 → Jaccard 1/6 < 0.5.
    expect(match_existing_flow("new.ts#run:function", ["a", "q", "r", "s", "t"], persisted)).toBeUndefined();
  });

  it("never matches the same id (that is a re-sync, handled before the remap)", () => {
    expect(match_existing_flow("old.ts#run:function", ["a", "b", "c", "d"], persisted)).toBeUndefined();
  });

  it("picks the best overlap and breaks ties by id", () => {
    const tied = [flow("z.ts#a:function", ["a", "b"]), flow("a.ts#a:function", ["a", "b"])];
    const match = match_existing_flow("new.ts#a:function", ["a", "b"], tied);
    expect(match?.flow.node.id).toBe("a.ts#a:function");
  });
});
