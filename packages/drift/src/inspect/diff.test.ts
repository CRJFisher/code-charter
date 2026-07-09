import { describe, expect, it } from "@jest/globals";

import { diff_summaries } from "./diff";
import type { DescriptionBreakdown, FlowSummary, StoreSummary } from "./summary";

function breakdown(over: Partial<DescriptionBreakdown> = {}): DescriptionBreakdown {
  return { docstring: 0, llm: 0, placeholder: 0, none: 0, ...over };
}

function flow(over: Partial<FlowSummary> & { id: string }): FlowSummary {
  return {
    label: "",
    live: true,
    seeds: [over.id],
    members: [over.id],
    member_count: 1,
    bridge_count: 0,
    last_synced_at: null,
    rationale: "",
    descriptions: breakdown({ placeholder: 1 }),
    ...over,
  };
}

function summary(over: Partial<StoreSummary> = {}): StoreSummary {
  return {
    live_flow_count: 0,
    retired_flow_count: 0,
    flows: [],
    bridges: [],
    descriptions: breakdown(),
    deferred_retirements: [],
    sync_status: null,
    ...over,
  };
}

describe("diff_summaries", () => {
  it("reports no change as unchanged when both sides match", () => {
    const s = summary({ flows: [flow({ id: "a.ts#x:function" })], descriptions: breakdown({ placeholder: 1 }) });
    const diff = diff_summaries(s, s);
    expect(diff.unchanged).toBe(true);
    expect(diff.flows).toHaveLength(0);
  });

  it("marks a hydrated flow as added (before null)", () => {
    const before = summary();
    const after = summary({
      flows: [flow({ id: "a.ts#x:function" })],
      descriptions: breakdown({ placeholder: 1 }),
    });
    const diff = diff_summaries(before, after);
    expect(diff.unchanged).toBe(false);
    expect(diff.flows).toHaveLength(1);
    expect(diff.flows[0].before).toBeNull();
    expect(diff.flows[0].after?.id).toBe("a.ts#x:function");
  });

  it("marks a vanished flow as removed (after null)", () => {
    const before = summary({ flows: [flow({ id: "a.ts#x:function" })] });
    const after = summary();
    const diff = diff_summaries(before, after);
    expect(diff.flows[0].before?.id).toBe("a.ts#x:function");
    expect(diff.flows[0].after).toBeNull();
  });

  it("includes a flow that flipped live→retired with both sides populated", () => {
    const before = summary({ flows: [flow({ id: "a.ts#x:function", live: true })] });
    const after = summary({ flows: [flow({ id: "a.ts#x:function", live: false })] });
    const diff = diff_summaries(before, after);
    expect(diff.flows).toHaveLength(1);
    expect(diff.flows[0].before?.live).toBe(true);
    expect(diff.flows[0].after?.live).toBe(false);
  });

  it("includes a flow whose member count changed and excludes one that only bumped last_synced_at", () => {
    const before = summary({
      flows: [
        flow({ id: "a.ts#x:function", member_count: 2, last_synced_at: "2026-07-08T00:00:00.000Z" }),
        flow({ id: "b.ts#y:function", member_count: 1, last_synced_at: "2026-07-08T00:00:00.000Z" }),
      ],
    });
    const after = summary({
      flows: [
        flow({ id: "a.ts#x:function", member_count: 3, last_synced_at: "2026-07-09T00:00:00.000Z" }),
        flow({ id: "b.ts#y:function", member_count: 1, last_synced_at: "2026-07-09T00:00:00.000Z" }),
      ],
    });
    const diff = diff_summaries(before, after);
    expect(diff.flows.map((f) => f.id)).toEqual(["a.ts#x:function"]);
  });

  it("diffs bridges by src→dst endpoints", () => {
    const before = summary({ bridges: [{ src_id: "a", dst_id: "b", rationale: "old" }] });
    const after = summary({ bridges: [{ src_id: "a", dst_id: "c", rationale: "new" }] });
    const diff = diff_summaries(before, after);
    expect(diff.bridges.added.map((b) => b.dst_id)).toEqual(["c"]);
    expect(diff.bridges.removed.map((b) => b.dst_id)).toEqual(["b"]);
  });

  it("carries both sides of the store-wide description split", () => {
    const before = summary({ descriptions: breakdown({ placeholder: 3 }) });
    const after = summary({ descriptions: breakdown({ placeholder: 1, llm: 2 }) });
    const diff = diff_summaries(before, after);
    expect(diff.unchanged).toBe(false);
    expect(diff.descriptions.before.placeholder).toBe(3);
    expect(diff.descriptions.after.llm).toBe(2);
  });
});
