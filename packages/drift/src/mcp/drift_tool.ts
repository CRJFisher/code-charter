/**
 * The pure `drift.*` tool handlers — functions of a {@link GraphStore} and a call context,
 * with no dependency on the MCP SDK or its transport. The server wiring (build_drift_server)
 * adapts them to MCP; tests drive them directly. Because they only ever call `GraphStore`
 * methods (and the store-derived helpers `outstanding_drift`/`reanchor_node`/`re_attachment_bin`),
 * a {@link NullGraphStore} host degrades them to empty/no-op with NO branching here (AC#5):
 * `all_nodes`/`all_edges` return `[]` and `restore`/`soft_delete`/`upsert_node` are no-ops.
 */

import { outstanding_drift, reanchor_node } from "@code-charter/core";
import type { GraphStore, GraphTarget } from "@code-charter/types";

import { now_iso, type LogCall } from "./call_log";
import { live_anchored_targets, re_attachment_bin, type DriftBinEntry } from "./re_attachment_bin";
import { TOOL_DRIFT_LIST, TOOL_DRIFT_NEXT, TOOL_DRIFT_RESOLVE } from "./tool_names";

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
  /** The `symbol_path` a `reanchor` or a targeted `reattach` committed the node onto, else null. */
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
 * `drift.next` — the loop primitive: the next outstanding re-attachment-bin entry to work, in the
 * bin's deterministic `(deleted_at, id)` recovery order, optionally narrowed to a `scope`. Returns
 * `null` when the (scoped) bin is empty — the loop's termination signal. Stateless: the bin shrinks
 * as entries resolve, so repeated calls advance naturally with no server-side cursor. Read-only.
 */
export function drift_next(
  store: GraphStore,
  args: { scope?: string },
  context: DriftToolContext,
): DriftBinEntry | null {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_NEXT, args });
  return re_attachment_bin(store, args.scope)[0] ?? null;
}

/**
 * `drift.resolve` — commit one outstanding drift resolution. `kind` addresses a node or edge
 * explicitly, so the lookup never rests on a node-id/edge-key disjointness assumption (AC#3):
 *  - `reanchor`: move a node with a staged relocation onto its renamed symbol. The authored fields,
 *    including a `user`-owned `description`, ride across untouched — only the anchor changes.
 *  - `reattach`: restore a re-attachment bin entry. Bare, it restores onto the *original* anchor; with
 *    a `target` symbol_path it re-points the stranded content onto that live symbol instead (AC#1),
 *    carrying the authored fields across — for the case where the original symbol is genuinely gone.
 *  - `delete`: keep a bin entry soft-deleted.
 *
 * A `kind`/`id` pair that is neither outstanding drift nor a bin entry is a no-op with `applied: false`.
 */
export function drift_resolve(
  store: GraphStore,
  args: { kind: DriftTargetKind; id: string; resolution: DriftResolution; target?: string },
  context: DriftToolContext,
): DriftResolveResult {
  context.log({ timestamp: now_iso(), caller: context.caller, tool: TOOL_DRIFT_RESOLVE, args });

  if (args.resolution === "reanchor") {
    return reanchor_resolve(store, args.kind, args.id);
  }

  const entry = re_attachment_bin(store).find((candidate) => candidate.kind === args.kind && candidate.id === args.id);
  if (entry === undefined) {
    return { id: args.id, resolution: args.resolution, target_kind: null, applied: false, reanchored_to: null };
  }

  const target: GraphTarget = { kind: entry.kind, id: entry.id };
  if (args.resolution === "delete") {
    store.soft_delete(target);
    return { id: args.id, resolution: args.resolution, target_kind: entry.kind, applied: true, reanchored_to: null };
  }

  // reattach
  if (args.target !== undefined) {
    if (entry.kind !== "node") {
      // an edge carries no anchor to re-point; reject rather than silently restore onto the original
      return { id: args.id, resolution: "reattach", target_kind: entry.kind, applied: false, reanchored_to: null };
    }
    return reattach_onto_target(store, args.id, args.target);
  }
  store.restore(target);
  return { id: args.id, resolution: "reattach", target_kind: entry.kind, applied: true, reanchored_to: null };
}

/**
 * Re-point a stranded bin node onto a chosen live symbol: restore it, then re-anchor it onto the
 * target's current anchor. The target is identified by its `symbol_path` (a candidate from `drift.list`)
 * and resolved against the live anchored symbols the store already holds — `agentic.description`
 * side-nodes and flow nodes, not raw rows (the raw tier is never persisted), so a code symbol's anchor
 * is read from its persisted side-content. A `target` that matches no live anchored symbol is a no-op
 * with `applied: false` — you cannot bind onto a symbol that is not there. The target is validated
 * BEFORE any write, so a bad target short-circuits without disturbing the binned node; only then is the
 * node restored (un-binned so `store.node` returns it) and re-anchored. The authored `description` and
 * its `user` ownership ride across untouched (`reanchor_node` rewrites only the anchor).
 */
function reattach_onto_target(store: GraphStore, id: string, target_symbol_path: string): DriftResolveResult {
  const target_anchor = live_anchored_targets(store).find((anchor) => anchor.symbol_path === target_symbol_path);
  if (target_anchor === undefined) {
    return { id, resolution: "reattach", target_kind: "node", applied: false, reanchored_to: null };
  }
  store.restore({ kind: "node", id });
  const stranded = store.node(id);
  if (stranded === undefined) {
    return { id, resolution: "reattach", target_kind: "node", applied: false, reanchored_to: null };
  }
  reanchor_node(store, stranded, target_anchor);
  return { id, resolution: "reattach", target_kind: "node", applied: true, reanchored_to: target_anchor.symbol_path };
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
