import { describe, expect, it } from "@jest/globals";

import {
  BRIDGE_EDGE_KIND,
  DESCRIPTION_NODE_KIND,
  description_node_id,
  FLOW_NODE_KIND,
  type EdgeRow,
  type NodeRow,
} from "@code-charter/core";

import type { ReconcileLogRecord } from "../reconcile/reconcile_log";
import {
  collect_flow_detail,
  collect_store_summary,
  count_proposed_bridges,
  detect_anomalies,
  type InspectInput,
} from "./summary";

function flow_node(
  id: string,
  opts: {
    label?: string;
    seeds?: string[];
    members?: string[];
    rationale?: string;
    last_synced_at?: string;
    deleted?: boolean;
  } = {},
): NodeRow {
  const members = opts.members ?? [];
  return {
    id,
    kind: FLOW_NODE_KIND,
    path: "",
    anchor: null,
    layer: "agentic",
    attributes: {
      label: opts.label ?? "",
      entry_points: opts.seeds ?? [],
      anchor_set: members,
      member_count: members.length,
      rationale: opts.rationale ?? "",
      last_synced_at: opts.last_synced_at ?? "2026-07-08T00:00:00.000Z",
    },
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    deleted_at: opts.deleted === true ? "2026-07-08T00:00:00.000Z" : null,
  };
}

function description_node(symbol_path: string, source: string, text: string, deleted = false): NodeRow {
  return {
    id: description_node_id(symbol_path),
    kind: DESCRIPTION_NODE_KIND,
    path: "",
    anchor: null,
    layer: "agentic",
    attributes: { description: text, description_source: source },
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    deleted_at: deleted ? "2026-07-08T00:00:00.000Z" : null,
  };
}

function bridge_edge(src_id: string, dst_id: string, rationale: string): EdgeRow {
  return {
    key: `${src_id}->${dst_id}`,
    src_id,
    dst_id,
    kind: BRIDGE_EDGE_KIND,
    confidence: 0.5,
    layer: "agentic",
    attributes: { inference_rationale: rationale },
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
  };
}

function input(nodes: NodeRow[], edges: EdgeRow[], latest_record: ReconcileLogRecord | null = null): InspectInput {
  return { nodes, edges, latest_record, sync_status: null };
}

describe("collect_store_summary", () => {
  it("counts live and retired flows separately and orders live before retired", () => {
    const summary = collect_store_summary(
      input([flow_node("b", { deleted: true }), flow_node("a"), flow_node("c")], []),
    );

    expect(summary.live_flow_count).toBe(2);
    expect(summary.retired_flow_count).toBe(1);
    expect(summary.flows.map((flow) => flow.id)).toEqual(["a", "c", "b"]);
  });

  it("reads member_count from anchor_set, so a code flow with no member edges is not empty", () => {
    const summary = collect_store_summary(
      input([flow_node("f", { members: ["x:function", "y:function"], seeds: ["x:function"] })], []),
    );

    expect(summary.flows[0].member_count).toBe(2);
    expect(summary.flows[0].seeds).toEqual(["x:function"]);
  });

  it("breaks descriptions down by source per flow and store-wide", () => {
    const summary = collect_store_summary(
      input(
        [
          flow_node("f", { members: ["a:function", "b:function", "c:function", "d:function"] }),
          description_node("a:function", "docstring", "from docstring"),
          description_node("b:function", "llm", "real text"),
          description_node("c:function", "placeholder", "c"),
          // d has no description node → counts as `none`
        ],
        [],
      ),
    );

    expect(summary.flows[0].descriptions).toEqual({ docstring: 1, llm: 1, placeholder: 1, none: 1 });
    expect(summary.descriptions).toEqual({ docstring: 1, llm: 1, placeholder: 1, none: 0 });
  });

  it("ignores soft-deleted description nodes", () => {
    const summary = collect_store_summary(
      input(
        [
          flow_node("f", { members: ["a:function"] }),
          description_node("a:function", "llm", "stale", true),
        ],
        [],
      ),
    );

    expect(summary.flows[0].descriptions.none).toBe(1);
    expect(summary.descriptions.llm).toBe(0);
  });

  it("scopes a bridge to a flow by anchor_set membership and surfaces its rationale", () => {
    const summary = collect_store_summary(
      input(
        [flow_node("f", { members: ["a:function", "b:function"] })],
        [bridge_edge("a:function", "b:function", "a passes the mutator to b")],
      ),
    );

    expect(summary.flows[0].bridge_count).toBe(1);
    expect(summary.bridges).toEqual([
      { src_id: "a:function", dst_id: "b:function", rationale: "a passes the mutator to b" },
    ]);
  });

  it("surfaces deferred retirements from the newest run-log record", () => {
    const record: ReconcileLogRecord = {
      timestamp: "2026-07-08T00:00:00.000Z",
      mode: "default",
      file_set: [],
      outcomes: [],
      deferred_retirements: [{ flow_id: "stale:function", reason: "empty call graph" }],
      description_counts: { docstring: 0, placeholder: 0, llm: 0 },
      diagnostics: [],
    };

    const summary = collect_store_summary(input([], [], record));

    expect(summary.deferred_retirements).toEqual([{ flow_id: "stale:function", reason: "empty call graph" }]);
  });
});

describe("collect_flow_detail", () => {
  it("returns per-member descriptions and the flow's bridges", () => {
    const detail = collect_flow_detail(
      input(
        [
          flow_node("f", { members: ["a:function", "b:function"], seeds: ["a:function"] }),
          description_node("a:function", "llm", "real text"),
        ],
        [bridge_edge("a:function", "b:function", "linked")],
      ),
      "f",
    );

    expect(detail?.member_descriptions).toEqual([
      { symbol_path: "a:function", source: "llm", text: "real text" },
      { symbol_path: "b:function", source: null, text: null },
    ]);
    expect(detail?.bridges).toHaveLength(1);
  });

  it("returns undefined for an unknown flow id", () => {
    expect(collect_flow_detail(input([flow_node("f")], []), "missing")).toBeUndefined();
  });

  it("drills into a retired flow", () => {
    const detail = collect_flow_detail(input([flow_node("f", { deleted: true })], []), "f");
    expect(detail?.live).toBe(false);
  });
});

describe("count_proposed_bridges", () => {
  it("sums declared bridges across umbrellas", () => {
    const stitch = JSON.stringify({
      umbrellas: [{ bridges: [{ from: "a", to: "b" }] }, { bridges: [{ from: "c", to: "d" }, { from: "e", to: "f" }] }],
    });
    expect(count_proposed_bridges(stitch)).toBe(3);
  });

  it("returns 0 for a seeds-only proposal (empty bridges)", () => {
    expect(count_proposed_bridges(JSON.stringify({ umbrellas: [{ bridges: [] }] }))).toBe(0);
  });

  it("returns null for an absent sidecar", () => {
    expect(count_proposed_bridges(null)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(count_proposed_bridges("{not json")).toBeNull();
  });
});

describe("detect_anomalies", () => {
  it("flags a live flow with 0 members but not a retired one", () => {
    const summary = collect_store_summary(
      input([flow_node("empty"), flow_node("gone", { deleted: true })], []),
    );

    const anomalies = detect_anomalies(summary, null);

    expect(anomalies).toEqual([{ code: "empty_flow", flow_id: "empty", message: "flow empty has 0 members" }]);
  });

  it("flags declared-but-unpersisted bridges as a persistence regression", () => {
    const summary = collect_store_summary(input([flow_node("f", { members: ["a:function"] })], []));

    const anomalies = detect_anomalies(summary, 2);

    expect(anomalies.map((a) => a.code)).toContain("unpersisted_bridges");
  });

  it("does not flag a seeds-only proposal with 0 persisted bridges", () => {
    const summary = collect_store_summary(input([flow_node("f", { members: ["a:function"] })], []));

    const anomalies = detect_anomalies(summary, 0);

    expect(anomalies.map((a) => a.code)).not.toContain("unpersisted_bridges");
  });

  it("flags a high placeholder ratio above the minimum count", () => {
    const members = ["a", "b", "c", "d", "e", "f"];
    const summary = collect_store_summary(
      input(
        [
          flow_node("f", { members }),
          ...members.slice(0, 4).map((m) => description_node(m, "placeholder", m)),
          ...members.slice(4).map((m) => description_node(m, "llm", "real")),
        ],
        [],
      ),
    );

    const anomalies = detect_anomalies(summary, null);

    expect(anomalies.map((a) => a.code)).toContain("high_placeholder_ratio");
  });

  it("does not flag a placeholder ratio below the minimum count", () => {
    const summary = collect_store_summary(
      input([flow_node("f", { members: ["a", "b"] }), description_node("a", "placeholder", "a"), description_node("b", "placeholder", "b")], []),
    );

    expect(detect_anomalies(summary, null).map((a) => a.code)).not.toContain("high_placeholder_ratio");
  });
});
