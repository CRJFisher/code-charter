import { NullGraphStore } from "./null_graph_store";

describe("NullGraphStore (AC#3 degraded store)", () => {
  const store = new NullGraphStore();

  it("returns empty reads and undefined lookups", () => {
    expect(store.all_nodes()).toEqual([]);
    expect(store.all_edges()).toEqual([]);
    expect(store.provenance_for_edge()).toEqual([]);
    expect(store.node()).toBeUndefined();
    expect(store.neighborhood()).toEqual({ nodes: [], edges: [] });
    expect(store.edges_for_files()).toEqual([]);
    expect(store.table_disposition()).toEqual([]);
    expect(store.write_fields()).toEqual({ skipped: [] });
  });

  it("makes writes no-ops that never throw", () => {
    expect(() => {
      store.upsert_node();
      store.upsert_edge();
      store.record_file_hash();
      store.invalidate_edges_for_files();
      store.invalidate_nodes_for_files();
      store.soft_delete();
      store.close();
    }).not.toThrow();
  });

  it("runs the rebuild write against the store itself, so callers' transactions still fire", () => {
    const write = jest.fn();
    store.rebuild_layer("raw", write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(store);
  });

  it("assumes change when nothing is known, and reports no real schema", () => {
    expect(store.file_changed_since_recorded()).toBe(true);
    expect(store.schema_version()).toBe(0);
  });
});
