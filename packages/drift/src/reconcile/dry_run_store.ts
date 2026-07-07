/**
 * A read-through, write-swallowing wrapper for the `--dry-run` path: reconciliation runs its full
 * detection (all reads hit the real store) but every mutation is a no-op, so it reports what it *would*
 * hydrate/re-sync without touching the store. One place owns the no-op, rather than threading a flag
 * through every writer.
 */

import type { GraphStore } from "@code-charter/core";

export function read_only_store(store: GraphStore): GraphStore {
  return {
    all_nodes: (opts) => store.all_nodes(opts),
    all_edges: (opts) => store.all_edges(opts),
    snapshot: () => store.snapshot(),
    provenance_for_edge: (key) => store.provenance_for_edge(key),
    node: (id) => store.node(id),
    neighborhood: (id, depth) => store.neighborhood(id, depth),
    edges_for_files: (paths) => store.edges_for_files(paths),
    file_changed_since_recorded: (path) => store.file_changed_since_recorded(path),
    table_disposition: () => store.table_disposition(),
    schema_version: () => store.schema_version(),
    upsert_node: () => {},
    upsert_edge: () => {},
    write_fields: () => ({ skipped: [] }),
    record_file_hash: () => {},
    invalidate_edges_for_files: () => {},
    invalidate_nodes_for_files: () => {},
    soft_delete: () => {},
    rebuild_layer: () => {},
    close: () => {},
  };
}
