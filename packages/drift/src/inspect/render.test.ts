import { describe, expect, it } from "@jest/globals";

import { render_anomalies, render_flow_detail, render_summary, render_summary_diff } from "./render";
import type { SummaryDiff } from "./diff";
import type { Anomaly, FlowDetail, FlowSummary, StoreSummary } from "./summary";

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

  it("reports a missing sync status in the status line", () => {
    const text = render_summary({ ...SUMMARY, sync_status: null }).join("\n");
    expect(text).toContain("sync status: (none recorded)");
  });

  it("surfaces the last_error at + message in the status line", () => {
    const text = render_summary({
      ...SUMMARY,
      sync_status: {
        last_attempt_at: "2026-07-08T00:00:00.000Z",
        last_success_at: null,
        last_error: { at: "2026-07-08T01:00:00.000Z", message: "reconcile contention" },
      },
    }).join("\n");

    expect(text).toContain("last_error 2026-07-08T01:00:00.000Z (reconcile contention)");
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
    expect(text).toContain("[none] a.ts#helper:function");
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

describe("render_summary_diff", () => {
  const ADDED: FlowSummary = {
    id: "a.ts#new:function",
    label: "new flow",
    live: true,
    seeds: ["a.ts#new:function"],
    members: ["a.ts#new:function", "a.ts#dep:function"],
    member_count: 2,
    bridge_count: 0,
    last_synced_at: "2026-07-09T00:00:00.000Z",
    rationale: "",
    descriptions: { docstring: 0, llm: 0, placeholder: 2, none: 0 },
  };

  it("renders a no-op reconcile as a single line", () => {
    const diff: SummaryDiff = {
      flows: [],
      bridges: { added: [], removed: [] },
      descriptions: { before: { docstring: 0, llm: 0, placeholder: 0, none: 0 }, after: { docstring: 0, llm: 0, placeholder: 0, none: 0 } },
      unchanged: true,
    };
    expect(render_summary_diff(diff)).toEqual(["no changes — the reconcile is a no-op for these files"]);
  });

  it("marks added flows with + and dropped flows with -", () => {
    const diff: SummaryDiff = {
      flows: [
        { id: ADDED.id, before: null, after: ADDED },
        { id: "b.ts#gone:function", before: { ...ADDED, id: "b.ts#gone:function", label: "" }, after: null },
      ],
      bridges: { added: [], removed: [] },
      descriptions: { before: { docstring: 0, llm: 0, placeholder: 0, none: 0 }, after: { docstring: 0, llm: 0, placeholder: 2, none: 0 } },
      unchanged: false,
    };
    const text = render_summary_diff(diff).join("\n");
    expect(text).toContain('+ [live] a.ts#new:function "new flow"');
    expect(text).toContain("- [live] b.ts#gone:function");
    expect(text).toContain("descriptions (store-wide): docstring 0, llm 0, placeholder 0→2, none 0");
  });

  it("renders a changed flow with only the fields that moved", () => {
    const before: FlowSummary = { ...ADDED, live: true, member_count: 2, bridge_count: 1 };
    const after: FlowSummary = { ...ADDED, live: false, member_count: 2, bridge_count: 0 };
    const diff: SummaryDiff = {
      flows: [{ id: ADDED.id, before, after }],
      bridges: { added: [], removed: [{ src_id: "a.ts#new:function", dst_id: "a.ts#dep:function", rationale: "calls" }] },
      descriptions: { before: { docstring: 0, llm: 0, placeholder: 2, none: 0 }, after: { docstring: 0, llm: 0, placeholder: 2, none: 0 } },
      unchanged: false,
    };
    const text = render_summary_diff(diff).join("\n");
    expect(text).toContain("~ a.ts#new:function: retired, bridges 1→0");
    expect(text).not.toContain("members");
    expect(text).toContain("bridges: +0 / -1");
    expect(text).toContain("- a.ts#new:function → a.ts#dep:function — calls");
  });

  it("renders a non-empty reason for a same-count re-anchor (never a blank ~ line)", () => {
    const before: FlowSummary = { ...ADDED, seeds: ["a.ts#old:function"], members: ["a.ts#old:function", "a.ts#dep:function"] };
    const after: FlowSummary = { ...ADDED, seeds: ["a.ts#new:function"], members: ["a.ts#new:function", "a.ts#dep:function"] };
    const diff: SummaryDiff = {
      flows: [{ id: ADDED.id, before, after }],
      bridges: { added: [], removed: [] },
      descriptions: { before: { docstring: 0, llm: 0, placeholder: 2, none: 0 }, after: { docstring: 0, llm: 0, placeholder: 2, none: 0 } },
      unchanged: false,
    };
    const line = render_summary_diff(diff).find((l) => l.includes("~ a.ts#new:function"));
    expect(line).toBeDefined();
    expect(line).toContain("members reanchored (2)");
    expect(line).toContain("seeds reanchored (1)");
    // The bug this guards: a flagged flow rendering as "~ <id>: " with nothing after the colon.
    expect(line?.trim()).not.toMatch(/~ \S+:\s*$/);
  });
});
