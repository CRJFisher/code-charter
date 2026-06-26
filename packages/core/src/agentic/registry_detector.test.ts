import { detect_meta_json_sub_agent_bridges } from "./registry_detector";

const META = [
  "{",
  '  "sub_agents": [',
  '    { "name": "reviewer", "file": "agents/reviewer.md" },',
  '    { "name": "missing", "file": "agents/missing.md" }',
  "  ]",
  "}",
].join("\n");

describe("detect_meta_json_sub_agent_bridges (AC#2)", () => {
  it("emits a bridge candidate per resolvable sub-agent, with meta.json provenance", () => {
    const candidates = detect_meta_json_sub_agent_bridges({
      meta_json_path: "skill/meta.json",
      meta_json_source: META,
      owner_id: "skill/SKILL.md#doc",
      resolve_target: (name) => (name === "reviewer" ? "skill/agents/reviewer.md#doc" : undefined),
    });
    expect(candidates).toHaveLength(1); // 'missing' is unresolvable → skipped
    const [bridge] = candidates;
    expect(bridge.src_id).toBe("skill/SKILL.md#doc");
    expect(bridge.dst_id).toBe("skill/agents/reviewer.md#doc");
    expect(bridge.inference_rationale).toBe("meta.json sub_agents[] declares 'reviewer'");
    expect(bridge.provenance.source_file).toBe("skill/meta.json");
    expect(bridge.provenance.source_range).toMatch(/^3:\d+-3:\d+$/);
    expect(bridge.provenance.extractor_id).toBe("agentic.registry");
    expect(bridge.provenance.extractor_version).toBe("1");
  });

  it("returns nothing when no declaration resolves", () => {
    const candidates = detect_meta_json_sub_agent_bridges({
      meta_json_path: "skill/meta.json",
      meta_json_source: META,
      owner_id: "skill/SKILL.md#doc",
      resolve_target: () => undefined,
    });
    expect(candidates).toEqual([]);
  });

  it("returns nothing when meta.json declares no sub_agents", () => {
    const candidates = detect_meta_json_sub_agent_bridges({
      meta_json_path: "skill/meta.json",
      meta_json_source: '{ "name": "skill" }',
      owner_id: "skill/SKILL.md#doc",
      resolve_target: () => "skill/agents/anything.md#doc",
    });
    expect(candidates).toEqual([]);
  });

  it("sorts emitted candidates by dst_id regardless of declaration order", () => {
    const source = [
      "{",
      '  "sub_agents": [',
      '    { "name": "zeta" },',
      '    { "name": "alpha" }',
      "  ]",
      "}",
    ].join("\n");
    const candidates = detect_meta_json_sub_agent_bridges({
      meta_json_path: "skill/meta.json",
      meta_json_source: source,
      owner_id: "skill/SKILL.md#doc",
      resolve_target: (name) => `skill/agents/${name}.md#doc`,
    });
    expect(candidates.map((c) => c.dst_id)).toEqual([
      "skill/agents/alpha.md#doc",
      "skill/agents/zeta.md#doc",
    ]);
  });
});
