/**
 * task-27.1.4 AC#1/#4 — deterministic gap-detection over the call graph.
 *
 * Static call-graph extraction leaves three kinds of gap a comprehension map must close. This module
 * finds them deterministically (no LLM, byte-stable across runs) and derives the candidate flow
 * boundaries task-27.1.6's flow-detection agent consumes lazily, per worked-on flow:
 *
 *   - ORPHAN ENTRYPOINTS — an entrypoint with no incident documentation edge. Each becomes a candidate
 *     flow seed.
 *   - UNRESOLVED / DYNAMIC-DISPATCH SHAPES — a node a majority of whose call sites fail to resolve to
 *     an in-graph callee (registry lookups, dynamic dispatch). A work-list item that feeds bridge
 *     inference (AC#2); not itself a seed.
 *   - DISCONNECTED COMPONENTS — an undirected island of code nodes reachable from no entrypoint. Each
 *     becomes a candidate *separate* flow.
 *
 * The boundary with task-27.1.6 is explicit: this module proposes candidates; the agent judges
 * umbrellas. It reads doc edges as plain rows (not the store) and the call graph as Ariadne emits it,
 * so it stays pure and host-agnostic, mirroring `flow.ts`.
 *
 * Note on the `unattributed` bucket (`build_skeleton_flows`): that bucket is *directed*
 * reachability-from-entrypoints — a render catch-all (AC#8). Disconnected components here are
 * *undirected* islands partitioned for the agent to consider promoting to their own flows. The two
 * answer different questions and never contradict; this module does not modify `build_skeleton_flows`.
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { EdgeRow } from "@code-charter/types";

import { LITERAL_DOC_EDGE_KIND } from "../extractors/extractor_ids";
import { flow_id_of, reachable_from } from "../model/flow";

export interface GapDetectionOptions {
  /** Max items kept per gap category before deterministic truncation. Default 200. */
  max_per_category?: number;
  /** Flag a node when its unresolved-call-site ratio is >= this. Default 0.5 (a majority unresolved). */
  unresolved_ratio_threshold?: number;
  /** Ignore nodes with fewer than this many real call sites (ratios on 0–1 sites are noise). Default 2. */
  min_call_sites?: number;
  /** Include `is_test` nodes as gap candidates. Default false. */
  include_tests?: boolean;
}

export const DEFAULT_GAP_OPTIONS: Required<GapDetectionOptions> = {
  max_per_category: 200,
  unresolved_ratio_threshold: 0.5,
  min_call_sites: 2,
  include_tests: false,
};

export interface OrphanEntrypoint {
  symbol_id: SymbolId;
  /** `flow_id_of(node)` — the symbol_path; the candidate flow-seed id. */
  flow_id: string;
  name: string;
  location: { file_path: string; line_number: number };
}

export interface UnresolvedShape {
  symbol_id: SymbolId;
  name: string;
  call_site_count: number;
  unresolved_count: number;
  dynamic_dispatch_count: number;
  resolved_out_degree: number;
  unresolved_ratio: number;
  location: { file_path: string; line_number: number };
}

export interface DisconnectedComponent {
  /** The lowest SymbolId in the component — its stable id and the candidate separate-flow seed. */
  representative: SymbolId;
  members: SymbolId[];
  member_count: number;
}

export interface GapTruncation {
  category: "orphan_entrypoints" | "unresolved_shapes" | "disconnected_components";
  total_found: number;
  kept: number;
}

export interface GapReport {
  orphan_entrypoints: OrphanEntrypoint[];
  unresolved_shapes: UnresolvedShape[];
  disconnected_components: DisconnectedComponent[];
  /** One entry per category that was capped; empty when nothing was dropped (never a silent cap). */
  truncations: GapTruncation[];
}

/** A candidate flow boundary the substrate proposes; task-27.1.6's agent judges it (AC#4). */
export interface CandidateSeed {
  /** Flow id (orphan entrypoint's symbol_path) or the component's representative id. */
  id: string;
  seeds: SymbolId[];
  origin: "orphan_entrypoint" | "disconnected_component";
  label: string;
  member_count: number;
}

function cmp_str(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The set of symbol_paths incident to a live `code.literal-doc` edge (either endpoint). */
function doc_incident_paths(doc_edges: readonly EdgeRow[]): Set<string> {
  const incident = new Set<string>();
  for (const edge of doc_edges) {
    if (edge.kind !== LITERAL_DOC_EDGE_KIND || edge.deleted_at !== null) continue;
    incident.add(edge.src_id);
    incident.add(edge.dst_id);
  }
  return incident;
}

export function find_orphan_entrypoints(
  graph: CallGraph,
  doc_edges: readonly EdgeRow[],
  options: Required<GapDetectionOptions>,
): OrphanEntrypoint[] {
  const incident = doc_incident_paths(doc_edges);
  const orphans: OrphanEntrypoint[] = [];
  for (const entry_point of [...graph.entry_points].sort()) {
    const node = graph.nodes.get(entry_point);
    if (!node) continue;
    if (node.is_test && !options.include_tests) continue;
    const flow_id = flow_id_of(node);
    if (incident.has(flow_id)) continue;
    orphans.push({
      symbol_id: entry_point,
      flow_id,
      name: node.name,
      location: { file_path: node.location.file_path, line_number: node.location.start_line },
    });
  }
  return orphans.sort((a, b) => cmp_str(a.flow_id, b.flow_id));
}

export function find_unresolved_shapes(
  graph: CallGraph,
  options: Required<GapDetectionOptions>,
): UnresolvedShape[] {
  const shapes: UnresolvedShape[] = [];
  for (const id of [...graph.nodes.keys()].sort()) {
    const node = graph.nodes.get(id)!;
    if (node.is_test && !options.include_tests) continue;
    let call_site_count = 0;
    let unresolved_count = 0;
    let dynamic_dispatch_count = 0;
    const resolved_targets = new Set<SymbolId>();
    for (const call of node.enclosed_calls) {
      if (call.is_callback_invocation) continue; // synthetic callback edges are not comprehension gaps
      call_site_count += 1;
      if (call.resolutions.length === 0) unresolved_count += 1;
      else if (call.resolutions.length > 1) dynamic_dispatch_count += 1;
      for (const resolution of call.resolutions) {
        if (graph.nodes.has(resolution.symbol_id)) resolved_targets.add(resolution.symbol_id);
      }
    }
    if (call_site_count < options.min_call_sites) continue;
    const unresolved_ratio = unresolved_count / call_site_count;
    if (unresolved_ratio < options.unresolved_ratio_threshold) continue;
    shapes.push({
      symbol_id: id,
      name: node.name,
      call_site_count,
      unresolved_count,
      dynamic_dispatch_count,
      resolved_out_degree: resolved_targets.size,
      unresolved_ratio,
      location: { file_path: node.location.file_path, line_number: node.location.start_line },
    });
  }
  return shapes.sort((a, b) => b.unresolved_ratio - a.unresolved_ratio || cmp_str(a.symbol_id, b.symbol_id));
}

export function find_disconnected_components(
  graph: CallGraph,
  options: Required<GapDetectionOptions>,
): DisconnectedComponent[] {
  const entry_set = new Set<SymbolId>(graph.entry_points);
  const indirect = graph.indirect_reachability ?? new Map();

  // Undirected adjacency over resolved, in-graph call edges.
  const adjacency = new Map<SymbolId, Set<SymbolId>>();
  for (const id of graph.nodes.keys()) adjacency.set(id, new Set());
  for (const id of [...graph.nodes.keys()].sort()) {
    for (const call of graph.nodes.get(id)!.enclosed_calls) {
      for (const resolution of call.resolutions) {
        const target = resolution.symbol_id;
        if (!graph.nodes.has(target) || target === id) continue;
        adjacency.get(id)!.add(target);
        adjacency.get(target)!.add(id);
      }
    }
  }

  const visited = new Set<SymbolId>();
  const components: DisconnectedComponent[] = [];
  for (const start of [...graph.nodes.keys()].sort()) {
    if (visited.has(start)) continue;
    // Nodes reachable out-of-band (callbacks, collection reads) are not island-eligible roots.
    if (indirect.has(start)) {
      visited.add(start);
      continue;
    }
    const members: SymbolId[] = [];
    const stack: SymbolId[] = [start];
    let touches_entry = false;
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      members.push(id);
      if (entry_set.has(id)) touches_entry = true;
      for (const neighbor of [...adjacency.get(id)!].sort()) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    if (touches_entry) continue;
    const real_members = members.filter((id) => !graph.nodes.get(id)!.is_test);
    if (!options.include_tests && real_members.length === 0) continue;
    members.sort();
    components.push({ representative: members[0], members, member_count: members.length });
  }
  return components.sort((a, b) => b.member_count - a.member_count || cmp_str(a.representative, b.representative));
}

/** Slice an already-sorted list to `max`, recording a truncation when anything is dropped. */
function bound<T>(items: T[], category: GapTruncation["category"], max: number, truncations: GapTruncation[]): T[] {
  if (items.length <= max) return items;
  truncations.push({ category, total_found: items.length, kept: max });
  return items.slice(0, max);
}

/** Run all three gap detectors and bound each category (no silent caps). */
export function detect_gaps(
  graph: CallGraph,
  doc_edges: readonly EdgeRow[],
  options?: GapDetectionOptions,
): GapReport {
  const opts = { ...DEFAULT_GAP_OPTIONS, ...options };
  const truncations: GapTruncation[] = [];
  return {
    orphan_entrypoints: bound(
      find_orphan_entrypoints(graph, doc_edges, opts),
      "orphan_entrypoints",
      opts.max_per_category,
      truncations,
    ),
    unresolved_shapes: bound(
      find_unresolved_shapes(graph, opts),
      "unresolved_shapes",
      opts.max_per_category,
      truncations,
    ),
    disconnected_components: bound(
      find_disconnected_components(graph, opts),
      "disconnected_components",
      opts.max_per_category,
      truncations,
    ),
    truncations,
  };
}

/**
 * Derive the candidate flow seeds (AC#4): one per orphan entrypoint (single-seed) and one per
 * disconnected component (member-set seed). Unresolved shapes are deliberately not seeds — they feed
 * bridge inference, not flow boundaries. Sorted by id for determinism.
 */
export function derive_candidate_seeds(report: GapReport, graph: CallGraph): CandidateSeed[] {
  const seeds: CandidateSeed[] = [];
  for (const orphan of report.orphan_entrypoints) {
    seeds.push({
      id: orphan.flow_id,
      seeds: [orphan.symbol_id],
      origin: "orphan_entrypoint",
      label: orphan.name,
      member_count: reachable_from(orphan.symbol_id, graph).size,
    });
  }
  for (const component of report.disconnected_components) {
    const node = graph.nodes.get(component.representative);
    seeds.push({
      id: component.representative,
      seeds: component.members,
      origin: "disconnected_component",
      label: node ? node.name : component.representative,
      member_count: component.member_count,
    });
  }
  return seeds.sort((a, b) => cmp_str(a.id, b.id));
}
