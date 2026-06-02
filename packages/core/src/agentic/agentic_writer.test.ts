import { SqliteGraphStore } from "../storage/sqlite_graph_store";
import { build_bridge_edges } from "./bridge";
import type { BridgeCandidate } from "./bridge";
import { description_node_id } from "./write_descriptions";
import type { ResolvedDescription } from "./write_descriptions";
import {
  rebuild_agentic_substrate,
  write_agentic_substrate,
} from "./agentic_writer";
import type { SubstrateProposal } from "./agentic_writer";

const HASH = "a".repeat(64);

function candidate(src: string, dst: string): BridgeCandidate {
  return {
    src_id: src,
    dst_id: dst,
    inference_rationale: `bridge ${src}->${dst}`,
    provenance: { source_file: "reg.json", source_range: "2:1-2:9", extractor_id: "agentic.registry", extractor_version: "1" },
  };
}

function description(symbol_path: string, text: string): ResolvedDescription {
  return { symbol_path, content_hash: HASH, file_path: "src/a.ts", text, source: "llm" };
}

function proposal(over: Partial<SubstrateProposal> = {}): SubstrateProposal {
  return {
    bridges: build_bridge_edges([candidate("s.ts#a:function", "t.ts#b:function")]),
    descriptions: [description("src/a.ts#a:function", "does a thing")],
    ...over,
  };
}

describe("write_agentic_substrate (AC#5)", () => {
  let store: SqliteGraphStore;
  beforeEach(() => (store = new SqliteGraphStore(":memory:")));
  afterEach(() => store.close());

  it("writes bridges with rationale + provenance and descriptions on the agentic lane", () => {
    const report = write_agentic_substrate(store, proposal());
    expect(report.bridges_written).toBe(1);
    expect(report.descriptions_written).toBe(1);

    const bridge = store.all_edges().find((e) => e.kind === "agentic.bridge")!;
    expect(bridge.attributes.inference_rationale).toBe("bridge s.ts#a:function->t.ts#b:function");
    expect(store.provenance_for_edge(bridge.key)[0].source_range).toBe("2:1-2:9");
    expect(store.node(description_node_id("src/a.ts#a:function"))?.attributes.description).toBe("does a thing");
  });

  it("is idempotent across a rebuild_layer('agentic') re-run", () => {
    rebuild_agentic_substrate(store, proposal());
    const edges1 = store.all_edges().length;
    const nodes1 = store.all_nodes().length;
    rebuild_agentic_substrate(store, proposal());
    expect(store.all_edges()).toHaveLength(edges1);
    expect(store.all_nodes()).toHaveLength(nodes1);
    const bridge = store.all_edges().find((e) => e.kind === "agentic.bridge")!;
    expect(store.provenance_for_edge(bridge.key)).toHaveLength(1); // not duplicated
  });

  it("never clobbers a user-promoted bridge", () => {
    write_agentic_substrate(store, proposal());
    const key = store.all_edges().find((e) => e.kind === "agentic.bridge")!.key;
    store.write_fields({ kind: "edge", id: key }, { note: "keep me" }, "user"); // promotes the edge to layer='user'

    const report = write_agentic_substrate(store, proposal());
    expect(report.preserved).toContain(key);
    const edge = store.all_edges().find((e) => e.key === key)!;
    expect(edge.layer).toBe("user");
    expect(edge.attributes.note).toBe("keep me");
  });

  it("does not resurrect a soft-deleted (binned) bridge", () => {
    write_agentic_substrate(store, proposal());
    const key = store.all_edges().find((e) => e.kind === "agentic.bridge")!.key;
    store.soft_delete({ kind: "edge", id: key });

    const report = write_agentic_substrate(store, proposal());
    expect(report.preserved).toContain(key);
    expect(store.all_edges().some((e) => e.key === key)).toBe(false); // still not live
  });

  it("caps bridges and logs the truncation (no silent cap)", () => {
    const messages: string[] = [];
    const bridges = build_bridge_edges([
      candidate("a", "b"),
      candidate("c", "d"),
      candidate("e", "f"),
    ]);
    const report = write_agentic_substrate(store, proposal({ bridges, descriptions: [] }), {
      limits: { max_bridges: 1 },
      log: (m) => messages.push(m),
    });
    expect(report.bridges_written).toBe(1);
    expect(report.truncated).toContainEqual({ kind: "bridges", requested: 3, written: 1 });
    expect(messages.some((m) => m.includes("capped bridges"))).toBe(true);
  });

  it("skips the description phase once the deadline is hit", () => {
    const times = [0, 100_000];
    let i = 0;
    const report = write_agentic_substrate(store, proposal(), { now: () => times[i++], log: () => undefined });
    expect(report.hit_deadline).toBe(true);
    expect(report.descriptions_written).toBe(0);
    expect(report.truncated).toContainEqual({ kind: "descriptions", requested: 1, written: 0 });
  });
});
