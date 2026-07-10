import { describe, expect, it } from "@jest/globals";

// Importing the bin is safe: main() no-ops without STITCH_EVAL_LIVE / --no-agent argv.
import { score_observed, type FixtureExpectation, type StoreFlows } from "./stitch_eval";

function flow(id: string, seeds: string[], members: string[]): StoreFlows["flows"][number] {
  return { id, label: id, entry_points: seeds, anchor_set: members };
}

function store(over: Partial<StoreFlows> = {}): StoreFlows {
  return { flows: [], bridges: [], descriptions: new Map(), ...over };
}

function described(anchors: string[], text = "Routes the payload through the registered pipeline."): StoreFlows["descriptions"] {
  return new Map(anchors.map((anchor) => [anchor, { text, source: "llm" }]));
}

function expectation(over: Partial<FixtureExpectation> = {}): FixtureExpectation {
  return {
    fixture: "synthetic",
    kind: "stitch",
    expected_flow_count: 1,
    expected_umbrellas: [["a:function", "b:function"]],
    expected_description_anchors: [],
    ...over,
  };
}

describe("score_observed — umbrella partition matching", () => {
  it("passes an exact single-umbrella stitch with an internal bridge", () => {
    const observed = store({
      flows: [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"])],
      bridges: [{ src_id: "a:function", dst_id: "b:function", rationale: "linked" }],
    });
    expect(score_observed(expectation(), observed)).toEqual([]);
  });

  it("fails when the umbrella carries no bridge between its own members (kind stitch)", () => {
    const observed = store({
      flows: [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"])],
      bridges: [{ src_id: "x:function", dst_id: "y:function", rationale: "elsewhere" }],
    });
    expect(score_observed(expectation(), observed).join("\n")).toContain("no agentic.bridge within umbrella");
  });

  it("passes a seeds-only umbrella with zero bridges", () => {
    const observed = store({
      flows: [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"])],
    });
    expect(score_observed(expectation({ kind: "stitch_seeds_only" }), observed)).toEqual([]);
  });

  it("passes a decline control of two singletons and fails it on any merge or bridge", () => {
    const control = expectation({ kind: "decline", expected_flow_count: 2, expected_umbrellas: [] });
    const clean = store({ flows: [flow("a:function", ["a:function"], ["a:function"]), flow("b:function", ["b:function"], ["b:function"])] });
    expect(score_observed(control, clean)).toEqual([]);

    const merged = store({ flows: [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"])] });
    expect(score_observed(control, merged).join("\n")).toContain("unexpected multi-seed umbrella");

    const bridged = store({
      flows: clean.flows,
      bridges: [{ src_id: "a:function", dst_id: "b:function", rationale: "wrong" }],
    });
    expect(score_observed(control, bridged).join("\n")).toContain("false positive");
  });

  it("passes a correct two-umbrella partition", () => {
    const two = expectation({
      expected_flow_count: 2,
      expected_umbrellas: [
        ["a:function", "b:function"],
        ["c:function", "d:function"],
      ],
    });
    const observed = store({
      flows: [
        flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"]),
        flow("c:function", ["c:function", "d:function"], ["c:function", "d:function"]),
      ],
      bridges: [
        { src_id: "a:function", dst_id: "b:function", rationale: "r1" },
        { src_id: "c:function", dst_id: "d:function", rationale: "r2" },
      ],
    });
    expect(score_observed(two, observed)).toEqual([]);
  });

  it("fails when two expected umbrellas collapsed into one mega-flow", () => {
    const two = expectation({
      expected_flow_count: 2,
      expected_umbrellas: [
        ["a:function", "b:function"],
        ["c:function", "d:function"],
      ],
    });
    const mega = store({
      flows: [flow("a:function", ["a:function", "c:function"], ["a:function", "b:function", "c:function", "d:function"])],
      bridges: [{ src_id: "a:function", dst_id: "c:function", rationale: "merged" }],
    });
    const failures = score_observed(two, mega).join("\n");
    expect(failures).toContain("no umbrella matches expected member set");
    expect(failures).toContain("unexpected multi-seed umbrella");
  });

  it("fails a fragmented result even when the flow count coincides", () => {
    const observed = store({
      flows: [flow("a:function", ["a:function"], ["a:function"])],
    });
    expect(score_observed(expectation(), observed).join("\n")).toContain("no umbrella matches expected member set");
  });

  it("rejects a superset membership — coverage is not equality", () => {
    const observed = store({
      flows: [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function", "stowaway:function"])],
      bridges: [{ src_id: "a:function", dst_id: "b:function", rationale: "r" }],
    });
    expect(score_observed(expectation(), observed).join("\n")).toContain("no umbrella matches expected member set");
  });
});

describe("score_observed — description quality", () => {
  const base = expectation({
    kind: "stitch_seeds_only",
    expected_description_anchors: ["create_handler.ts#handle_create:function"],
  });
  const umbrella = [flow("a:function", ["a:function", "b:function"], ["a:function", "b:function"])];

  it("fails an absent or non-llm description", () => {
    const observed = store({ flows: umbrella });
    expect(score_observed(base, observed).join("\n")).toContain("no agent-authored description");
  });

  it("fails a name-restatement description", () => {
    const observed = store({
      flows: umbrella,
      descriptions: new Map([
        ["create_handler.ts#handle_create:function", { text: "Handles create.", source: "llm" }],
      ]),
    });
    expect(score_observed(base, observed).join("\n")).toContain("restates its name");
  });

  it("fails a description missing its expected golden phrase", () => {
    const with_golden: FixtureExpectation = {
      ...base,
      expected_description_contains: { "create_handler.ts#handle_create:function": ["registry"] },
    };
    const observed = store({
      flows: umbrella,
      descriptions: described(["create_handler.ts#handle_create:function"], "Writes a new record to the store."),
    });
    expect(score_observed(with_golden, observed).join("\n")).toContain('misses expected phrase "registry"');
  });

  it("passes a substantive description that carries its golden", () => {
    const with_golden: FixtureExpectation = {
      ...base,
      expected_description_contains: { "create_handler.ts#handle_create:function": ["registry"] },
    };
    const observed = store({
      flows: umbrella,
      descriptions: described(
        ["create_handler.ts#handle_create:function"],
        "Writes the new record the registry routed here.",
      ),
    });
    expect(score_observed(with_golden, observed)).toEqual([]);
  });
});
