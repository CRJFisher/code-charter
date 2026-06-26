import { BRIDGE_EDGE_KIND } from "../model/flow";
import { BRIDGE_CONFIDENCE_INFERRED, bridge_edge_key, build_bridge_edges } from "./bridge";
import type { BridgeCandidate } from "./bridge";

function candidate(over: Partial<BridgeCandidate> = {}): BridgeCandidate {
  return {
    src_id: "s.ts#hub:function",
    dst_id: "t.ts#worker:function",
    inference_rationale: "registry link",
    provenance: { source_file: "s.ts", source_range: "3:2-3:20", extractor_id: "agentic.registry", extractor_version: "1" },
    ...over,
  };
}

describe("build_bridge_edges (AC#2)", () => {
  it("builds an agentic.bridge edge with rationale and lower confidence", () => {
    const [{ edge, provenance }] = build_bridge_edges([candidate()]);
    expect(edge.kind).toBe(BRIDGE_EDGE_KIND);
    expect(edge.layer).toBe("agentic");
    expect(edge.confidence).toBe(BRIDGE_CONFIDENCE_INFERRED);
    expect(edge.confidence).toBeLessThan(1);
    expect(edge.attributes.inference_rationale).toBe("registry link");
    expect(edge.key).toBe(bridge_edge_key(edge.src_id, edge.dst_id));
  });

  it("carries the definition span as NOT-NULL provenance for click-through", () => {
    const [{ provenance }] = build_bridge_edges([candidate()]);
    expect(provenance).toEqual([
      { edge_key: bridge_edge_key("s.ts#hub:function", "t.ts#worker:function"), source_file: "s.ts", source_range: "3:2-3:20", extractor_id: "agentic.registry", extractor_version: "1" },
    ]);
  });

  it("collapses two candidates for the same (src,dst) into one edge with both spans", () => {
    const result = build_bridge_edges([
      candidate({ provenance: { source_file: "s.ts", source_range: "3:2-3:20", extractor_id: "agentic.registry", extractor_version: "1" } }),
      candidate({ provenance: { source_file: "s.ts", source_range: "9:2-9:20", extractor_id: "agentic.registry", extractor_version: "1" } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].provenance).toHaveLength(2);
  });

  it("dedupes a candidate pair sharing an identical provenance span", () => {
    const result = build_bridge_edges([
      candidate({ provenance: { source_file: "s.ts", source_range: "3:2-3:20", extractor_id: "agentic.registry", extractor_version: "1" } }),
      candidate({ provenance: { source_file: "s.ts", source_range: "3:2-3:20", extractor_id: "agentic.registry", extractor_version: "2" } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].provenance).toHaveLength(1);
    expect(result[0].provenance[0].extractor_version).toBe("1");
  });

  it("returns an empty array for no candidates", () => {
    expect(build_bridge_edges([])).toEqual([]);
  });

  it("sorts output by edge key for byte-stability", () => {
    const keys = build_bridge_edges([
      candidate({ dst_id: "z.ts#z:function" }),
      candidate({ dst_id: "a.ts#a:function" }),
    ]).map((r) => r.edge.key);
    expect(keys).toEqual([...keys].sort());
  });
});
