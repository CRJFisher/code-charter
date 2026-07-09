import { describe, expect, it } from "@jest/globals";

import { render_anomalies, render_flow_detail, render_summary } from "./render";
import type { Anomaly, FlowDetail, StoreSummary } from "./summary";

const SUMMARY: StoreSummary = {
  live_flow_count: 1,
  retired_flow_count: 1,
  flows: [
    {
      id: "a.ts#entry:function",
      label: "entry flow",
      live: true,
      seeds: ["a.ts#entry:function"],
      members: ["a.ts#entry:function", "a.ts#helper:function"],
      member_count: 2,
      bridge_count: 1,
      last_synced_at: "2026-07-08T00:00:00.000Z",
      rationale: "",
      descriptions: { docstring: 1, llm: 1, placeholder: 0, none: 0 },
    },
    {
      id: "b.ts#old:function",
      label: "",
      live: false,
      seeds: [],
      members: [],
      member_count: 0,
      bridge_count: 0,
      last_synced_at: null,
      rationale: "",
      descriptions: { docstring: 0, llm: 0, placeholder: 0, none: 0 },
    },
  ],
  bridges: [{ src_id: "a.ts#entry:function", dst_id: "a.ts#helper:function", rationale: "entry calls helper" }],
  descriptions: { docstring: 1, llm: 1, placeholder: 0, none: 0 },
  deferred_retirements: [{ flow_id: "c.ts#x:function", reason: "empty call graph" }],
  sync_status: { last_attempt_at: "2026-07-08T00:00:00.000Z", last_success_at: "2026-07-08T00:00:00.000Z", last_error: null },
};

describe("render_summary", () => {
  it("renders counts, flow rows, bridges, and deferred retirements", () => {
    const text = render_summary(SUMMARY).join("\n");

    expect(text).toContain("flows: 1 live, 1 retired");
    expect(text).toContain("[live] a.ts#entry:function");
    expect(text).toContain("[retired] b.ts#old:function");
    expect(text).toContain("a.ts#entry:function → a.ts#helper:function — entry calls helper");
    expect(text).toContain("deferred retirements: 1");
    expect(text).toContain("c.ts#x:function — empty call graph");
  });

  it("reports a missing run log in the status line", () => {
    const text = render_summary({ ...SUMMARY, sync_status: null }).join("\n");
    expect(text).toContain("sync status: (no run log)");
  });
});

describe("render_flow_detail", () => {
  it("renders seeds, per-member descriptions, and bridges", () => {
    const detail: FlowDetail = {
      ...SUMMARY.flows[0],
      member_descriptions: [
        { symbol_path: "a.ts#entry:function", source: "docstring", text: "the entry point" },
        { symbol_path: "a.ts#helper:function", source: null, text: null },
      ],
      bridges: SUMMARY.bridges,
    };

    const text = render_flow_detail(detail).join("\n");

    expect(text).toContain("flow a.ts#entry:function [live]");
    expect(text).toContain("[docstring] a.ts#entry:function — the entry point");
    expect(text).toContain("[(none)] a.ts#helper:function");
  });
});

describe("render_anomalies", () => {
  it("renders a clean bill when there are none", () => {
    expect(render_anomalies([])).toEqual(["no anomalies detected"]);
  });

  it("renders one line per anomaly with its code", () => {
    const anomalies: Anomaly[] = [
      { code: "empty_flow", flow_id: "f", message: "flow f has 0 members" },
      { code: "unpersisted_bridges", message: "stitch.json declares 2 bridge(s) but 0 are persisted" },
    ];

    const text = render_anomalies(anomalies).join("\n");

    expect(text).toContain("2 anomaly(ies):");
    expect(text).toContain("[empty_flow] flow f has 0 members");
    expect(text).toContain("[unpersisted_bridges]");
  });
});
