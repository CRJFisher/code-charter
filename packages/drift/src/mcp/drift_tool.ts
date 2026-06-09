/**
 * The pure `drift.*` tool handlers — functions of a {@link GraphStore} and a call context,
 * with no dependency on the MCP SDK or its transport. The server wiring (build_drift_server)
 * adapts them to MCP; tests drive them directly. Because they only ever call `GraphStore`
 * methods (and the store-derived helpers `outstanding_drift`/`reanchor_node`),
 * a {@link NullGraphStore} host degrades them to a no-op with NO branching here:
 * `all_nodes` returns `[]` and `upsert_node` is a no-op.
 */

import { outstanding_drift, reanchor_node } from "@code-charter/core";
import type { GraphStore } from "@code-charter/types";

import { now_iso, type LogCall } from "./call_log";
import { TOOL_DRIFT_RESOLVE } from "./tool_names";

/** Per-call context threaded from the MCP layer into the pure handlers. */
export interface DriftToolContext {
  /** The calling session id, or "unknown". */
  caller: string;
  /** Where to record the call. */
  log: LogCall;
}

/**
 * How `drift.resolve` acts on a target. The sole resolution is `reanchor`: commit an outstanding
 * relocation — the staged re-anchor a code rename produced — moving the diagram content onto the
 * renamed symbol. (Kept as a named single-member union for the MCP enum wire-shape; the
 * relocation/reanchor accept-dance, this last arm included, is removed in task-27.1.15.1.)
 */
export type DriftResolution = "reanchor";

/** Whether `id` addresses a node or an edge — supplied explicitly, never inferred from id disjointness. */
export type DriftTargetKind = "node" | "edge";

/** Outcome of a `drift.resolve` call. */
export interface DriftResolveResult {
  id: string;
  resolution: DriftResolution;
  /** The kind of the resolved target, or null when `id` is not a resolvable target. */
  target_kind: DriftTargetKind | null;
  /** True when the resolution was applied; false when `id` was not found. */
  applied: boolean;
  /** The `symbol_path` a `reanchor` committed the node onto, else null. */
  reanchored_to: string | null;
}

/**
 * `drift.resolve` — commit one outstanding drift resolution. `kind` addresses a node or edge
 * explicitly, so the lookup never rests on a node-id/edge-key disjointness assumption:
 *  - `reanchor`: move a node with a staged relocation onto its renamed symbol. Its fields ride across
 *    untouched — only the anchor changes.
 *
 * A `kind`/`id` pair that is not outstanding drift is a no-op with `applied: false`.
 */
export function drift_resolve(
  store: GraphStore,
  args: { kind: DriftTargetKind; id: string; resolution: DriftResolution },
  context: DriftToolContext,
): DriftResolveResult {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_RESOLVE, args });
  return reanchor_resolve(store, args.kind, args.id);
}

/** Commit the staged relocation on node `id`, re-anchoring it onto the resolver-determined symbol. */
function reanchor_resolve(store: GraphStore, kind: DriftTargetKind, id: string): DriftResolveResult {
  if (kind !== "node") {
    // edges never carry a staged relocation — outstanding drift is a node-only surface
    return { id, resolution: "reanchor", target_kind: null, applied: false, reanchored_to: null };
  }
  const observation = outstanding_drift(store).find((o) => o.node_id === id);
  const node = observation === undefined ? undefined : store.node(id);
  if (observation === undefined || node === undefined) {
    return { id, resolution: "reanchor", target_kind: null, applied: false, reanchored_to: null };
  }
  reanchor_node(store, node, { symbol_path: observation.to_symbol_path, content_hash: observation.to_content_hash });
  return { id, resolution: "reanchor", target_kind: "node", applied: true, reanchored_to: observation.to_symbol_path };
}
