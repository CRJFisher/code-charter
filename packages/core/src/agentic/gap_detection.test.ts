import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { flow_id_of } from "../model/flow";
import { make_graph, make_node } from "../model/__fixtures__/call_graph";
import type { NodeSpec } from "../model/__fixtures__/call_graph";
import { DEFAULT_GAP_OPTIONS, find_orphan_entrypoints } from "./gap_detection";

const LITERAL_DOC_EDGE_KIND = "code.literal-doc";

/** The symbol_path a doc edge must reference to document a given entrypoint spec. */
function symbol_path_of(spec: NodeSpec): string {
  return flow_id_of(make_node(spec));
}

function doc_edge(src_id: string, over: Partial<EdgeRow> = {}): EdgeRow {
  return {
    key: `doc:${src_id}`,
    src_id,
    dst_id: "doc#1",
    kind: LITERAL_DOC_EDGE_KIND,
    confidence: 1,
    layer: "raw",
    attributes: {},
    field_ownership: {},
    origin: "test",
    intent_source: "code-edit",
    adjudication: null,
    deleted_at: null,
    ...over,
  };
}

describe("find_orphan_entrypoints (AC#1)", () => {
  const main: NodeSpec = { id: "main", name: "main", file: "m.ts" };
  const other: NodeSpec = { id: "other", name: "other", file: "o.ts" };

  it("flags an entrypoint with no incident doc edge and not one that has one", () => {
    const graph = make_graph([main, other], ["main", "other"]);
    const orphans = find_orphan_entrypoints(graph, [doc_edge(symbol_path_of(main))], DEFAULT_GAP_OPTIONS);
    expect(orphans).toEqual([symbol_path_of(other)]);
  });

  it("returns orphan flow_ids sorted regardless of entrypoint encounter order", () => {
    const graph = make_graph([other, main], ["other", "main"]);
    const orphans = find_orphan_entrypoints(graph, [], DEFAULT_GAP_OPTIONS);
    expect(orphans).toEqual([symbol_path_of(main), symbol_path_of(other)]);
  });

  it("returns no orphans when every entrypoint is documented", () => {
    const graph = make_graph([main, other], ["main", "other"]);
    const edges = [doc_edge(symbol_path_of(main)), doc_edge(symbol_path_of(other))];
    expect(find_orphan_entrypoints(graph, edges, DEFAULT_GAP_OPTIONS)).toEqual([]);
  });

  it("treats a doc edge on the dst side as documenting too", () => {
    const graph = make_graph([main], ["main"]);
    const edge = doc_edge("doc#1", { dst_id: symbol_path_of(main) });
    expect(find_orphan_entrypoints(graph, [edge], DEFAULT_GAP_OPTIONS)).toHaveLength(0);
  });

  it("does not treat a raw SymbolId as a documenting reference (id-space guard)", () => {
    const graph = make_graph([main], ["main"]);
    // A doc edge keyed on the Ariadne SymbolId 'main', not the symbol_path, must NOT document it.
    const orphans = find_orphan_entrypoints(graph, [doc_edge("main")], DEFAULT_GAP_OPTIONS);
    expect(orphans).toHaveLength(1);
  });

  it("ignores non-doc and soft-deleted edges", () => {
    const graph = make_graph([main], ["main"]);
    const calls = doc_edge(symbol_path_of(main), { kind: "code.calls" });
    const deleted = doc_edge(symbol_path_of(main), { deleted_at: "2026-01-01T00:00:00Z" });
    expect(find_orphan_entrypoints(graph, [calls, deleted], DEFAULT_GAP_OPTIONS)).toHaveLength(1);
  });

  it("excludes test entrypoints by default, includes them on request", () => {
    const t: NodeSpec = { id: "t", name: "t_main", file: "t.ts", is_test: true };
    const graph = make_graph([t], ["t"]);
    expect(find_orphan_entrypoints(graph, [], DEFAULT_GAP_OPTIONS)).toHaveLength(0);
    expect(find_orphan_entrypoints(graph, [], { ...DEFAULT_GAP_OPTIONS, include_tests: true })).toHaveLength(1);
  });

  it("de-duplicates entrypoints that collapse to the same flow_id (D-FLOW-IDENTITY)", () => {
    // Two distinct SymbolIds, same file+name+kind → one symbol_path → one candidate seed id.
    const graph = make_graph(
      [
        { id: "m1", name: "main", file: "app.ts" },
        { id: "m2", name: "main", file: "app.ts" },
      ],
      ["m1", "m2"],
    );
    expect(find_orphan_entrypoints(graph, [], DEFAULT_GAP_OPTIONS)).toHaveLength(1);
  });
});
