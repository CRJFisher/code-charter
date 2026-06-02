/**
 * The pure `drift.*` tool handlers — functions of a {@link GraphStore} and a call context,
 * with no dependency on the MCP SDK or its transport. The server wiring (build_drift_server)
 * adapts them to MCP; tests drive them directly. Because they only ever call `GraphStore`
 * methods (and the store-derived helpers `outstanding_drift`/`reanchor_node`), a
 * {@link NullGraphStore} host degrades them to empty/no-op with NO branching here (AC#5):
 * `all_nodes`/`all_edges` return `[]` and `restore`/`soft_delete`/`upsert_node` are no-ops.
 */

import { outstanding_drift, reanchor_node } from "@code-charter/core";
import type { GraphStore, GraphTarget } from "@code-charter/types";

import { now_iso, type LogCall } from "./call_log";
import { re_attachment_bin, type DriftBinEntry } from "./re_attachment_bin";
import { TOOL_DRIFT_LIST, TOOL_DRIFT_RESOLVE } from "./tool_names";

/** Per-call context threaded from the MCP layer into the pure handlers. */
export interface DriftToolContext {
  /** The calling session id, or "unknown". */
  caller: string;
  /** Where to record the call. */
  log: LogCall;
}

/**
 * How `drift.resolve` acts on a target. `reattach`/`delete` operate on a re-attachment bin entry
 * (soft-deleted content); `reanchor` commits an outstanding relocation — the staged re-anchor a
 * code rename produced — moving the preserved content onto the renamed symbol.
 */
export type DriftResolution = "reattach" | "delete" | "reanchor";

/** Outcome of a `drift.resolve` call. */
export interface DriftResolveResult {
  id: string;
  resolution: DriftResolution;
  /** The kind of the resolved target, or null when `id` is not a resolvable target. */
  target_kind: "node" | "edge" | null;
  /** True when the resolution was applied; false when `id` was not found. */
  applied: boolean;
  /** The `symbol_path` a `reanchor` committed the node onto, else null. */
  reanchored_to: string | null;
}

/** `drift.list` — read the re-attachment bin, optionally narrowed to a `scope` prefix. */
export function drift_list(
  store: GraphStore,
  args: { scope?: string },
  context: DriftToolContext,
): DriftBinEntry[] {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_LIST, args });
  return re_attachment_bin(store, args.scope);
}

/**
 * `drift.resolve` — commit one outstanding drift resolution:
 *  - `reanchor`: move a node with a staged relocation onto its renamed symbol (AC#4). The authored
 *    fields, including a `user`-owned `description`, ride across untouched — only the anchor changes.
 *  - `reattach` / `delete`: restore or keep-removed a re-attachment bin entry (soft-deleted content).
 *
 * The target's kind/space is recovered from the store, so the caller passes only an `id`. An `id`
 * that is neither outstanding drift nor a bin entry is a no-op with `applied: false`.
 */
export function drift_resolve(
  store: GraphStore,
  args: { id: string; resolution: DriftResolution },
  context: DriftToolContext,
): DriftResolveResult {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_RESOLVE, args });

  if (args.resolution === "reanchor") {
    return reanchor_resolve(store, args.id);
  }

  const entry = re_attachment_bin(store).find((candidate) => candidate.id === args.id);
  if (entry === undefined) {
    return { id: args.id, resolution: args.resolution, target_kind: null, applied: false, reanchored_to: null };
  }

  const target: GraphTarget = { kind: entry.kind, id: entry.id };
  if (args.resolution === "reattach") {
    store.restore(target);
  } else {
    store.soft_delete(target);
  }
  return { id: args.id, resolution: args.resolution, target_kind: entry.kind, applied: true, reanchored_to: null };
}

/** Commit the staged relocation on node `id`, re-anchoring it onto the resolver-determined symbol. */
function reanchor_resolve(store: GraphStore, id: string): DriftResolveResult {
  const observation = outstanding_drift(store).find((o) => o.node_id === id);
  const node = observation === undefined ? undefined : store.node(id);
  if (observation === undefined || node === undefined) {
    return { id, resolution: "reanchor", target_kind: null, applied: false, reanchored_to: null };
  }
  reanchor_node(store, node, { symbol_path: observation.to_symbol_path, content_hash: observation.to_content_hash });
  return { id, resolution: "reanchor", target_kind: "node", applied: true, reanchored_to: observation.to_symbol_path };
}
