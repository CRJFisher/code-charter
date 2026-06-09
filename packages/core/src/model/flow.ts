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
 * content_hash is deliberately excluded; including it would re-key the flow on every save). A rename of
 * the dominant seed changes the id: the superseded flow is retired (soft-deleted) and the renamed
 * entrypoint re-hydrates as a fresh flow; a skeleton flow is simply re-derived to the new id each session.
 *
 * Membership (AC#2) is subgraph-induced: re-induced from seeds + bridges + linked docs on demand, never
 * a stored enumerated leaf set. "Which flow does leaf L belong to" is answered by re-inducing each
 * flow's subgraph and testing membership ({@link flow_of_leaf}) — a leaf shared by two entrypoint trees
 * legitimately belongs to both.
 *
 * Rendering a flow's subgraph (induce → project to rows → file-module scaffold fold → per-view budget)
 * lives in `flow_projection.ts` ({@link project_flow}); the persisted store read for hydrated flows is
 * {@link read_hydrated_flows}, fed `NodeRow`s by the host so core stays store-agnostic.
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

/**
 * The endpoint-only shape of a bridge used to (re-)induce flow membership — `induce_members` traverses
 * from `dst_id` (a call-graph `SymbolId`). The provenance-carrying persistence builder for
 * `agentic.bridge` rows lives in `agentic/bridge.ts` ({@link BridgeCandidate} / `build_bridge_edges`,
 * task-27.1.4); this interface is just the induction input, not the persisted row.
 */
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

  // De-duplicate by id, keeping the first (largest) occurrence. Distinct top-level functions in one
  // file cannot share a name, but two same-named method entrypoints on different classes collapse to
  // one id under the v1 enclosing-free `symbol_path` (D-FLOW-IDENTITY); dropping the duplicate keeps
  // the selector free of duplicate keys and render_flow's lookup unambiguous.
  const deduped: SkeletonFlow[] = [];
  const seen = new Set<string>();
  for (const flow of flows) {
    if (seen.has(flow.id)) continue;
    seen.add(flow.id);
    deduped.push(flow);
  }

  const unattributed = [...graph.nodes.keys()].filter((id) => !attributed.has(id)).sort();
  if (unattributed.length > 0) {
    deduped.push({
      id: UNATTRIBUTED_FLOW_ID,
      label: UNATTRIBUTED_FLOW_LABEL,
      seeds: unattributed,
      is_unattributed: true,
      member_count: unattributed.length,
      seed_location: null,
    });
  }
  return deduped;
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

/**
 * Map a `SymbolId` set to sorted, deduped flow-layer `symbol_path`s (the inverse of {@link flow_id_of}).
 * This is the single derivation of a flow's member-path set — a hydrated flow persists it as its
 * `anchor_set`, and the symbol-level re-sync trigger re-derives it to detect membership drift, so the
 * "anchor_set == paths_of(members)" invariant lives in one place.
 */
export function paths_of(ids: ReadonlySet<SymbolId>, graph: CallGraph): string[] {
  const paths = new Set<string>();
  for (const id of ids) {
    const node = graph.nodes.get(id);
    if (node !== undefined) paths.add(flow_id_of(node));
  }
  return [...paths].sort();
}

/**
 * The `symbol_path → SymbolId` index over the current graph (the inverse of {@link flow_id_of}). A
 * persisted flow stores its seeds/bridges as rename-stable `symbol_path`s (task-27.1.6), but induction
 * traverses the live `CallGraph` keyed by `SymbolId`; this is the bridge between the two id spaces.
 * First-wins in sorted-id order, mirroring `build_skeleton_flows`'s dedup, so the mapping is
 * deterministic when two callables collapse to one enclosing-free `symbol_path`.
 */
export function build_symbol_path_index(graph: CallGraph): Map<string, SymbolId> {
  const index = new Map<string, SymbolId>();
  for (const id of [...graph.nodes.keys()].sort()) {
    const symbol_path = flow_id_of(graph.nodes.get(id)!);
    if (!index.has(symbol_path)) index.set(symbol_path, id);
  }
  return index;
}

/** The persisted rows a hydrated flow reconstructs from: its `agentic.flow` node + its incident edges. */
export interface PersistedFlowRows {
  flow_node: NodeRow;
  /** `agentic.flow_member` edges whose `src_id` is the flow (dst = a seed root or a linked-doc id). */
  member_edges: readonly EdgeRow[];
  /** `agentic.bridge` edges incident to one of the flow's members. */
  bridge_edges: readonly EdgeRow[];
}

/**
 * Gather one persisted flow's rows from plain node/edge arrays — the host-agnostic read both the drift
 * engine (over the store) and the webview render path (over a snapshot) share.
 */
export function collect_persisted_flow(
  flow_id: string,
  nodes: readonly NodeRow[],
  edges: readonly EdgeRow[],
): PersistedFlowRows | undefined {
  const flow_node = nodes.find((n) => n.id === flow_id && n.kind === FLOW_NODE_KIND && n.deleted_at === null);
  if (flow_node === undefined) return undefined;
  const member_edges = edges.filter(
    (e) => e.kind === FLOW_MEMBER_EDGE_KIND && e.src_id === flow_id && e.deleted_at === null,
  );
  const member_ids = new Set(member_edges.map((e) => e.dst_id));
  const bridge_edges = edges.filter(
    (e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null && (member_ids.has(e.src_id) || member_ids.has(e.dst_id)),
  );
  return { flow_node, member_edges, bridge_edges };
}

/**
 * Reconstruct the induce-able {@link FlowMembership} for a persisted flow (task-27.1.6 render + re-sync).
 * Stored member/bridge endpoints are `symbol_path`s; a dst that resolves to a live `SymbolId` is a
 * call-graph seed/bridge target, and one that does not is a linked doc (doc nodes are not in the call
 * graph). The flow id passes through unchanged (it is itself a `symbol_path`).
 */
export function reconstruct_flow_membership(rows: PersistedFlowRows, graph: CallGraph): FlowMembership {
  const index = build_symbol_path_index(graph);
  const seeds: SymbolId[] = [];
  const linked_docs: string[] = [];
  // Seeds live on the flow node's `entry_points` (so the flow node never needs a self-referential member
  // edge); member edges carry the non-seed members (linked docs, extra roots). A candidate that resolves
  // to a live SymbolId is a call-graph seed; one that does not is a doc member (docs are not in the graph).
  const stored_entry = rows.flow_node.attributes.entry_points;
  const candidates = new Set<string>([
    ...(Array.isArray(stored_entry) ? (stored_entry as string[]) : []),
    ...rows.member_edges.map((edge) => edge.dst_id),
  ]);
  for (const id of candidates) {
    const symbol_id = index.get(id);
    if (symbol_id !== undefined) seeds.push(symbol_id);
    else linked_docs.push(id);
  }
  const bridges: BridgeEdge[] = [];
  for (const edge of rows.bridge_edges) {
    const symbol_id = index.get(edge.dst_id);
    if (symbol_id !== undefined) bridges.push({ src_id: edge.src_id, dst_id: symbol_id });
    else linked_docs.push(edge.dst_id); // a bridge to a doc (e.g. a skill sub-agent) is a doc member
  }
  return { id: rows.flow_node.id, seeds, bridges, linked_docs };
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

function string_attr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number_attr(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
