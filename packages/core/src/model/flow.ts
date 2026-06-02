/**
 * task-27.1.3 — the flow entity, deterministic skeleton, membership, and persistence-row builders.
 *
 * A **flow** is v1's unit of comprehension: the subgraph induced by `{seed entrypoint roots} +
 * {agent-inferred bridge edges} + {linked docs}`, with the deterministic call-graph supplying each
 * seeded tree's interior for free. This module is the single source of flow truth — pure, host-agnostic,
 * derived from an in-memory Ariadne `CallGraph`. It writes nothing to a store: the deterministic
 * skeleton is recomputed each session; the `agentic.flow` row builders here are the seam task-27.1.6
 * uses to persist a *hydrated* flow, not a v1 live path.
 *
 * Identity (AC#4): a flow's id is the dominant seed entrypoint's `symbol_path` — the location-free,
 * body-independent half of its anchor, so the id is stable across body edits and line shifts (the
 * content_hash is deliberately excluded; including it would re-key the flow on every save). A rename
 * moves the name segment, re-anchored by the resolver when 27.1.6 persists; a skeleton flow is simply
 * re-derived to the new id each session. The full sorted-anchor-set hash + ≥50% overlap remap is
 * deferred to task-27.1.6 (D-FLOW-IDENTITY).
 *
 * Membership (AC#2) is subgraph-induced: re-induced from seeds + bridges + linked docs on demand, never
 * a stored enumerated leaf set. "Which flow does leaf L belong to" is answered by re-inducing each
 * flow's subgraph and testing membership ({@link flow_of_leaf}) — a leaf shared by two entrypoint trees
 * legitimately belongs to both.
 */

import type { CallGraph, CallableNode, SymbolId } from "@ariadnejs/types";
import type { EdgeRow, FlowSummary, NodeRow } from "@code-charter/types";

import { build_symbol_path } from "../resolver/code_state";

/** The fixed sentinel id of the single `unattributed` bucket (AC#8) — it has no seed entrypoint. */
export const UNATTRIBUTED_FLOW_ID = "agentic.flow:unattributed";
/** The label shown for the `unattributed` bucket. */
export const UNATTRIBUTED_FLOW_LABEL = "Unattributed";

/** The `agentic.flow` node kind (AC#1). Distinct from the file-module `agentic.group` (task-27.1.2). */
export const FLOW_NODE_KIND = "agentic.flow";
/** Flow → seed-root / flow → linked-doc membership edge (AC#1). NOT `agentic.contains` (the scaffold). */
export const FLOW_MEMBER_EDGE_KIND = "agentic.flow_member";
/** Cross-call-graph link edge (AC#1), inferred by the flow-detector (task-27.1.6). */
export const BRIDGE_EDGE_KIND = "agentic.bridge";

/** A cross-tree link the flow-detector (task-27.1.6) infers; v1 ships only the builder, never inference. */
export interface BridgeEdge {
  src_id: string;
  dst_id: string;
}

/**
 * A deterministic, in-memory flow descriptor derived from the call graph. NOT persisted — recomputed
 * each session. A hydrated flow (task-27.1.6) reduces to the same shape plus its stored `agentic.flow`
 * node.
 */
export interface SkeletonFlow {
  /** Flow id = dominant seed's `symbol_path` (AC#4), or {@link UNATTRIBUTED_FLOW_ID}. */
  id: string;
  label: string;
  /** Seed entrypoint roots whose reachable subgraphs (re-)induce membership. */
  seeds: SymbolId[];
  is_unattributed: boolean;
  /** Reachable subgraph size. */
  member_count: number;
  seed_location: { file_path: string; line_number: number } | null;
}

/** The induce-able shape of any flow (skeleton or hydrated): seeds + bridges + linked docs (AC#2). */
export interface FlowMembership {
  id: string;
  seeds: SymbolId[];
  bridges?: BridgeEdge[];
  linked_docs?: string[];
}

/** The dominant seed's `symbol_path` — the flow id (AC#4). Entrypoints are top-level, so enclosing is []. */
export function flow_id_of(node: CallableNode): string {
  return build_symbol_path(node.location.file_path, [], node.name, node.definition.kind);
}

/**
 * The set of nodes reachable from `seed` by forward traversal of resolved call edges. Children are
 * visited in sorted id order and cycles are guarded, so the result is deterministic and terminating.
 * A resolution whose target is not a node in the graph (external/unresolved) is skipped.
 */
export function reachable_from(seed: SymbolId, graph: CallGraph): Set<SymbolId> {
  const visited = new Set<SymbolId>();
  const stack: SymbolId[] = [seed];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = graph.nodes.get(id);
    if (!node) continue;
    const callees: SymbolId[] = [];
    for (const call of node.enclosed_calls) {
      for (const resolution of call.resolutions) {
        if (graph.nodes.has(resolution.symbol_id)) callees.push(resolution.symbol_id);
      }
    }
    callees.sort();
    for (const callee of callees) {
      if (!visited.has(callee)) stack.push(callee);
    }
  }
  return visited;
}

/**
 * The whole-repo deterministic skeleton (AC#3, AC#8): one flow per top-level entrypoint, ordered by
 * reachable size (descending, id-tiebroken), plus a single `unattributed` bucket for code reachable
 * from no entrypoint, always last. Byte-stable across runs: entrypoints are processed in sorted-id
 * order and every set is sorted before use.
 */
export function build_skeleton_flows(graph: CallGraph): SkeletonFlow[] {
  const entry_points = [...graph.entry_points].sort();
  const attributed = new Set<SymbolId>();
  const flows: SkeletonFlow[] = [];

  for (const entry_point of entry_points) {
    const node = graph.nodes.get(entry_point);
    if (!node) continue;
    const reachable = reachable_from(entry_point, graph);
    for (const id of reachable) attributed.add(id);
    flows.push({
      id: flow_id_of(node),
      label: node.name,
      seeds: [entry_point],
      is_unattributed: false,
      member_count: reachable.size,
      seed_location: { file_path: node.location.file_path, line_number: node.location.start_line },
    });
  }

  // Ranked: larger reachable subgraphs first; id ascending breaks ties deterministically.
  flows.sort((a, b) => b.member_count - a.member_count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const unattributed = [...graph.nodes.keys()].filter((id) => !attributed.has(id)).sort();
  if (unattributed.length > 0) {
    flows.push({
      id: UNATTRIBUTED_FLOW_ID,
      label: UNATTRIBUTED_FLOW_LABEL,
      seeds: unattributed,
      is_unattributed: true,
      member_count: unattributed.length,
      seed_location: null,
    });
  }
  return flows;
}

/** Project a {@link SkeletonFlow} to the never-hydrated {@link FlowSummary} the selector renders. */
export function skeleton_to_summary(flow: SkeletonFlow): FlowSummary {
  return {
    id: flow.id,
    label: flow.label,
    is_hydrated: false,
    last_synced_at: null,
    member_count: flow.member_count,
    is_unattributed: flow.is_unattributed,
    seed_location: flow.seed_location,
  };
}

/**
 * The ordered selector list (AC#7): hydrated flows first by `last_synced_at` (most recent first, nulls
 * last), then the deterministic skeleton in its own order. A skeleton flow whose id is already hydrated
 * is dropped — the hydrated entry supersedes it (the skeleton is the substrate the agent upgraded).
 */
export function order_flows(hydrated: FlowSummary[], skeleton: FlowSummary[]): FlowSummary[] {
  const ranked_hydrated = [...hydrated].sort((a, b) => {
    if (a.last_synced_at === b.last_synced_at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (a.last_synced_at === null) return 1;
    if (b.last_synced_at === null) return -1;
    return a.last_synced_at < b.last_synced_at ? 1 : -1; // most recent first
  });
  const hydrated_ids = new Set(ranked_hydrated.map((flow) => flow.id));
  const remaining_skeleton = skeleton.filter((flow) => !hydrated_ids.has(flow.id));
  return [...ranked_hydrated, ...remaining_skeleton];
}

/** Read persisted hydrated flows from the store (AC#7) — `agentic.flow` nodes. Empty until task-27.1.6. */
export function read_hydrated_flows(nodes: readonly NodeRow[]): FlowSummary[] {
  return nodes
    .filter((node) => node.kind === FLOW_NODE_KIND && node.deleted_at === null)
    .map((node) => ({
      id: node.id,
      label: string_attr(node.attributes.label) ?? node.id,
      is_hydrated: true,
      last_synced_at: string_attr(node.attributes.last_synced_at) ?? null,
      member_count: number_attr(node.attributes.member_count) ?? 0,
      is_unattributed: false,
      seed_location: null,
    }));
}

/**
 * Re-induce a flow's member node set (AC#2): the union of every seed's reachable subgraph, every
 * bridge endpoint's reachable subgraph (a bridge pulls in the linked tree), and the linked docs. No
 * stored leaf set is consulted.
 */
export function induce_members(flow: FlowMembership, graph: CallGraph): Set<SymbolId> {
  const members = new Set<SymbolId>();
  for (const seed of flow.seeds) {
    for (const id of reachable_from(seed, graph)) members.add(id);
  }
  for (const bridge of flow.bridges ?? []) {
    for (const id of reachable_from(bridge.dst_id as SymbolId, graph)) members.add(id);
  }
  for (const doc of flow.linked_docs ?? []) members.add(doc as SymbolId);
  return members;
}

/** Which flows a leaf belongs to (AC#2): re-induce each flow's subgraph and test membership — set-valued. */
export function flow_of_leaf(leaf: SymbolId, flows: FlowMembership[], graph: CallGraph): string[] {
  return flows.filter((flow) => induce_members(flow, graph).has(leaf)).map((flow) => flow.id);
}

// --- persistence-row builders (AC#1 seam; task-27.1.6 persists, v1 only unit-tests) ----------------

/**
 * The `agentic.flow` node a hydrated flow persists as (AC#1): an open `kind`, `layer='agentic'`, no
 * schema migration. `entry_points`/`exit_points`/`rationale` ride the attribute bag.
 */
export function build_flow_node(args: {
  id: string;
  label: string;
  entry_points: string[];
  exit_points: string[];
  rationale: string;
  last_synced_at?: string;
}): NodeRow {
  const attributes: Record<string, unknown> = {
    label: args.label,
    entry_points: args.entry_points,
    exit_points: args.exit_points,
    rationale: args.rationale,
  };
  if (args.last_synced_at !== undefined) attributes.last_synced_at = args.last_synced_at;
  return {
    id: args.id,
    kind: FLOW_NODE_KIND,
    path: "",
    anchor: null,
    layer: "agentic",
    attributes,
    field_ownership: {},
    origin: "flow-detector",
    intent_source: "code-edit",
    deleted_at: null,
  };
}

/** `agentic.flow_member` edges from a flow to its seed roots + linked docs (AC#1). Deterministic keys. */
export function build_flow_member_edges(flow_id: string, member_ids: readonly string[]): EdgeRow[] {
  return [...member_ids]
    .sort()
    .map((member_id) => ({
      key: `${FLOW_MEMBER_EDGE_KIND}:${flow_id}->${member_id}`,
      src_id: flow_id,
      dst_id: member_id,
      kind: FLOW_MEMBER_EDGE_KIND,
      confidence: 1,
      layer: "agentic" as const,
      attributes: {},
      field_ownership: {},
      origin: "flow-detector",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    }));
}

/** `agentic.bridge` edges for cross-call-graph links (AC#1). Lower confidence — renders distinct. */
export function build_bridge_edges(bridges: readonly BridgeEdge[]): EdgeRow[] {
  return [...bridges]
    .sort((a, b) => (a.src_id + a.dst_id < b.src_id + b.dst_id ? -1 : 1))
    .map((bridge) => ({
      key: `${BRIDGE_EDGE_KIND}:${bridge.src_id}->${bridge.dst_id}`,
      src_id: bridge.src_id,
      dst_id: bridge.dst_id,
      kind: BRIDGE_EDGE_KIND,
      confidence: 0.5,
      layer: "agentic" as const,
      attributes: {},
      field_ownership: {},
      origin: "flow-detector",
      intent_source: "code-edit",
      adjudication: null,
      deleted_at: null,
    }));
}

function string_attr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number_attr(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
