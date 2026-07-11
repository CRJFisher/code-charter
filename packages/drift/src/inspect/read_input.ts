/**
 * Read a store path into an {@link InspectInput}: the graph snapshot plus the run-log sidecars the
 * summary folds in. The read is strictly read-only (never competing for the write lock, never running
 * schema init); a store that was never reconciled (no db file) is the empty input, not an error.
 *
 * The seam `drift-inspect` and `drift-dev` share: both build a {@link StoreSummary} off a store
 * path and must gather it identically, so the before/after diff of a scratch reconcile is comparing
 * like with like.
 */

import * as fs from "node:fs";

import { open_graph_store } from "@code-charter/core";

import { read_latest_reconcile_record, read_sync_status, sync_status_path } from "../reconcile/reconcile_log";
import type { InspectInput } from "./summary";

export function read_inspect_input(store_path: string): InspectInput {
  const latest_record = read_latest_reconcile_record(store_path);
  const sync_status = fs.existsSync(sync_status_path(store_path)) ? read_sync_status(store_path) : null;
  if (!fs.existsSync(store_path)) {
    return { nodes: [], edges: [], latest_record, sync_status };
  }
  const store = open_graph_store(store_path, { read_only: true });
  try {
    // include_deleted so retired (soft-deleted) flow nodes are surfaced and counted; the summary's
    // bridge/description collectors keep their own deleted_at===null filters, so only retired FLOWS
    // are surfaced while bridges and descriptions stay live-only.
    const { nodes, edges } = store.snapshot({ include_deleted: true });
    return { nodes, edges, latest_record, sync_status };
  } finally {
    store.close();
  }
}
