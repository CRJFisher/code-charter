import { describe, expect, it } from "@jest/globals";

import { build_manifest, derive_kind } from "./harvest";
import type { ReconcileRunRecord } from "./reconcile_log";
import type { FlowDetail, FlowSummary, StoreSummary } from "../inspect/summary";

function flow(id: string, over: Partial<FlowSummary> = {}): FlowSummary {
  return {
    id,
    label: id,
    live: true,
    seeds: [id],
    members: [id],
    member_count: 1,
    bridge_count: 0,
    last_synced_at: null,
    rationale: "",
    descriptions: { docstring: 0, provisional: 0, placeholder: 0, llm: 0, none: 1 },
    ...over,
  };
}

function summary(flows: FlowSummary[]): StoreSummary {
  return {
    live_flow_count: flows.filter((f) => f.live).length,
    retired_flow_count: flows.filter((f) => !f.live).length,
    flows,
    bridges: [],
    descriptions: { docstring: 0, provisional: 0, placeholder: 0, llm: 0, none: 0 },
    sync_status: null,
    deferred_retirements: [],
    deferred_skill_syncs: [],
  };
}

function record(flow_ids: string[]): ReconcileRunRecord {
  return {
    schema_version: 1,
    run_id: "20260710T120000000Z-aabbccdd",
    session_id: null,
    instruction: null,
    timestamp: "t",
    detail: {
      mode: "default",
      file_set: ["src/a.ts"],
      outcomes: flow_ids.map((flow_id) => ({
        flow_id,
        action: "resync",
        kind: "code",
        member_count: 1,
        last_synced_at: null,
        reason: "body drifted",
      })),
      deferred_retirements: [],
      deferred_skill_syncs: [],
      description_counts: { docstring: 0, provisional: 0, placeholder: 0, llm: 0 },
      diagnostics: [],
    },
  };
}

const GRADE = { verdict: "good", reason: "why", graded_at: "t" };

describe("derive_kind", () => {
  it("classifies a bridged scope as stitch", () => {
    expect(derive_kind([flow("a", { bridge_count: 1 })], 1)).toBe("stitch");
  });

  it("classifies a bridgeless multi-seed flow as stitch_seeds_only", () => {
    expect(derive_kind([flow("a", { seeds: ["a", "b"] })], 0)).toBe("stitch_seeds_only");
  });

  it("classifies singleton-only scopes as decline", () => {
    expect(derive_kind([flow("a"), flow("b")], 0)).toBe("decline");
  });
});

describe("build_manifest", () => {
  it("freezes the run-scoped flows: members union, llm anchors, derived kind", () => {
    const umbrella = flow("a", { seeds: ["a", "b"], members: ["a", "b", "c"], member_count: 3 });
    const detail: FlowDetail = {
      ...umbrella,
      member_descriptions: [
        { symbol_path: "a", source: "llm", text: "real" },
        { symbol_path: "b", source: "provisional", text: "b" },
      ],
      bridges: [],
    };
    const manifest = build_manifest(record(["a"]), GRADE, "bergamot", "h-t", summary([umbrella, flow("other")]), (id) =>
      id === "a" ? detail : undefined,
    );
    expect(manifest).not.toBeNull();
    expect(manifest?.detail.kind).toBe("stitch_seeds_only");
    expect(manifest?.detail.expected_flow_count).toBe(1); // scoped to the run, not the store
    expect(manifest?.detail.expected_members).toEqual(["a", "b", "c"]);
    expect(manifest?.detail.expected_description_anchors).toEqual(["a"]);
    expect(manifest?.verdict).toBe("good");
    expect(manifest?.source_repo).toBe("bergamot");
  });

  it("refuses a run whose outcomes name no live flow instead of widening to the store", () => {
    const retired = flow("gone", { live: false });
    expect(build_manifest(record(["gone"]), GRADE, "r", "t", summary([retired, flow("alive")]), () => undefined)).toBeNull();
    expect(build_manifest(record([]), GRADE, "r", "t", summary([flow("alive")]), () => undefined)).toBeNull();
  });
});
