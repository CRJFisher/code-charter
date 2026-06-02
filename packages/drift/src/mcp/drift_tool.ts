/**
 * The pure `drift.*` tool handlers — functions of a {@link GraphStore} and a call context,
 * with no dependency on the MCP SDK or its transport. The server wiring (build_drift_server)
 * adapts them to MCP; tests drive them directly. Because they only ever call `GraphStore`
 * methods, a {@link NullGraphStore} host degrades them to empty/no-op with NO branching here
 * (AC#5): `all_nodes`/`all_edges` return `[]` and `restore`/`soft_delete` are no-ops.
 */

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

/** How `drift.resolve` acts on a bin entry. */
export type DriftResolution = "reattach" | "delete";

/** Outcome of a `drift.resolve` call. */
export interface DriftResolveResult {
  id: string;
  resolution: DriftResolution;
  /** The kind of the resolved target, or null when `id` is not in the bin. */
  target_kind: "node" | "edge" | null;
  /** True when the resolution was applied; false when `id` was not found in the bin. */
  applied: boolean;
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
 * `drift.resolve` — reattach (`restore`) or delete (`soft_delete`) a bin entry. The entry's
 * kind (node vs edge) is recovered by looking `id` up in the bin, so the caller need not know
 * which id-space it belongs to. An `id` not in the bin is a no-op with `applied: false`.
 */
export function drift_resolve(
  store: GraphStore,
  args: { id: string; resolution: DriftResolution },
  context: DriftToolContext,
): DriftResolveResult {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_RESOLVE, args });

  const entry = re_attachment_bin(store).find((candidate) => candidate.id === args.id);
  if (entry === undefined) {
    return { id: args.id, resolution: args.resolution, target_kind: null, applied: false };
  }

  const target: GraphTarget = { kind: entry.kind, id: entry.id };
  if (args.resolution === "reattach") {
    store.restore(target);
  } else {
    store.soft_delete(target);
  }
  return { id: args.id, resolution: args.resolution, target_kind: entry.kind, applied: true };
}
