/**
 * The HYDRATE branch (AC#2/#3/#9): build a flow's diagram the first time its code is worked on. Two
 * shapes share one persistence path:
 *
 *  - a SKILL umbrella — a skill bundle (SKILL.md + scripts + references + sub-agents). Its members are
 *    the bundle's doc nodes (the literal extractor already wrote them); its bridges are the agentic
 *    `meta.json sub_agents[]` links. The skill-dir boundary is the AC#3 ground-truth signal.
 *  - a CODE umbrella — a deterministic skeleton flow (one entrypoint tree) upgraded in place: its
 *    members are the call-graph reachable subgraph, its descriptions come from the deterministic-first
 *    describe step.
 *
 * Bridges and descriptions are persisted through {@link write_agentic_substrate} — the documented,
 * cost-bounded, preservation-honoring substrate writer (task-27.1.4 AC#5) — and the `agentic.flow` node
 * + member edges through {@link write_flow}; both are scoped (no store-global `rebuild_layer`). Each write
 * stamps `last_synced_at`. On a genuine HYDRATE (a new id), the ≥50% overlap remap (AC#9) carries a
 * user-owned label across an id change and strands the superseded flow into the re-attachment bin; on a
 * RE-SYNC (`allow_remap: false`) the remap is skipped, since the id is unchanged by construction.
 *
 * Called by reconcile() (the engine entry is reconcile.ts; the process entry is bin/drift_reconcile.ts).
 */

import type { CallGraph, SymbolId } from "@ariadnejs/types";
import type { BridgeCandidate, EdgeRow, ProvenanceRow, SubstrateProposal } from "@code-charter/core";
import {
  build_bridge_edges,
  detect_meta_json_sub_agent_bridges,
  induce_members,
  paths_of,
  write_agentic_substrate,
} from "@code-charter/core";

import { anchor_set_hash, match_existing_flow } from "./flow_identity";
import { read_persisted_flows, write_flow } from "./flow_store";
import type { PersistedFlow } from "./flow_store";
import { resolve_descriptions } from "./describe";
import type { FlowOutcome, ReconcileDeps } from "./types";

/** A skill bundle to hydrate as one flow. */
export interface SkillUmbrella {
  kind: "skill";
  /** Flow id — namespaced (`agentic.flow:skill:<name>`) so it never collides with a skill doc node id. */
  id: string;
  label: string;
  /** The SKILL.md doc node id — the flow's entry point (jump-to-source + a member). */
  skill_doc_id: string;
  /** All bundle doc node ids (the flow's members). */
  doc_node_ids: readonly string[];
  /** Raw `meta.json` text, or null when the bundle has none. */
  meta_json_source: string | null;
  /** `${skill}/meta.json` path for bridge provenance. */
  meta_json_path: string;
  /** Resolve a declared sub-agent name to its doc node id, or undefined. */
  resolve_subagent: (name: string) => string | undefined;
}

/** A code entrypoint tree to hydrate as one flow. */
export interface CodeUmbrella {
  kind: "code";
  /** Flow id = dominant seed's symbol_path (== the skeleton id, so the stub is upgraded in place). */
  id: string;
  label: string;
  seeds: readonly SymbolId[];
}

export type Umbrella = SkillUmbrella | CodeUmbrella;

export interface HydrateOptions {
  /** Run the ≥50% overlap identity remap (AC#9). True on a genuine HYDRATE; false on a re-sync. */
  allow_remap?: boolean;
  /** Run the (cost-bearing) describe step. False for the singleton-stub overflow above the cap (AC#8). */
  describe?: boolean;
}

interface RemapResult {
  /** A user-owned label carried across an id change, to re-stamp as user-owned on the new flow. */
  label?: string;
}

/**
 * The ≥50% overlap remap: when a freshly-detected flow's id differs from a persisted one but their
 * members substantially overlap, the persisted flow is the same flow under a new id. Carry its
 * user-owned label, and strand the old flow (node + member edges) into the re-attachment bin so nothing
 * dangles and the move is recoverable.
 */
function apply_remap(
  deps: ReconcileDeps,
  new_id: string,
  member_set: readonly string[],
  persisted: readonly PersistedFlow[],
): RemapResult | undefined {
  const match = match_existing_flow(new_id, member_set, persisted);
  if (match === undefined) return undefined;
  const old = match.flow;
  const carried = old.node.field_ownership?.label === "user" ? (old.node.attributes.label as string) : undefined;
  deps.store.soft_delete({ kind: "node", id: old.node.id });
  for (const edge of old.member_edges) deps.store.soft_delete({ kind: "edge", id: edge.key });
  deps.log(`remap: ${old.node.id} → ${new_id} (overlap ${match.overlap.toFixed(2)})`);
  return { label: carried };
}

/** Re-stamp a carried user label as user-owned so a later agentic pass cannot overwrite it (AC#6/#9). */
function restamp_carried_label(deps: ReconcileDeps, flow_id: string, remap: RemapResult | undefined): void {
  if (remap?.label !== undefined) {
    deps.store.write_fields({ kind: "node", id: flow_id }, { label: remap.label }, "user");
  }
}

export async function hydrate_skill_flow(
  deps: ReconcileDeps,
  umbrella: SkillUmbrella,
  options: HydrateOptions = {},
): Promise<FlowOutcome> {
  const member_ids = [...umbrella.doc_node_ids].sort();
  const remap = options.allow_remap ? apply_remap(deps, umbrella.id, member_ids, read_persisted_flows(deps.store)) : undefined;
  const last_synced_at = deps.now();

  const proposal: SubstrateProposal = { bridges: build_skill_bridges(umbrella), descriptions: [] };
  write_agentic_substrate(deps.store, proposal);
  write_flow(deps.store, {
    id: umbrella.id,
    label: remap?.label ?? umbrella.label,
    seed_paths: [umbrella.skill_doc_id],
    member_ids,
    rationale: `skill bundle '${umbrella.label}' grouped as one flow`,
    anchor_set: member_ids,
    anchor_set_hash: anchor_set_hash(member_ids),
    last_synced_at,
  });
  restamp_carried_label(deps, umbrella.id, remap);

  return { flow_id: umbrella.id, action: "hydrate", kind: "skill", member_count: member_ids.length, last_synced_at };
}

function build_skill_bridges(umbrella: SkillUmbrella): Array<{ edge: EdgeRow; provenance: ProvenanceRow[] }> {
  if (umbrella.meta_json_source === null) return [];
  const candidates: BridgeCandidate[] = detect_meta_json_sub_agent_bridges({
    meta_json_path: umbrella.meta_json_path,
    meta_json_source: umbrella.meta_json_source,
    owner_id: umbrella.id,
    resolve_target: umbrella.resolve_subagent,
  });
  return build_bridge_edges(candidates);
}

export async function hydrate_code_flow(
  deps: ReconcileDeps,
  umbrella: CodeUmbrella,
  graph: CallGraph,
  options: HydrateOptions = {},
): Promise<FlowOutcome> {
  const members = induce_members({ id: umbrella.id, seeds: [...umbrella.seeds] }, graph);
  const member_paths = paths_of(members, graph);
  const seed_paths = paths_of(new Set(umbrella.seeds), graph);

  // Deterministic-first describe over the flow's member files, persisted (with the cost ceiling) through
  // the substrate writer; a user-owned description is preserved by the ladder. Skipped for the
  // singleton-stub overflow above the per-turn cap (AC#8).
  let descriptions: Awaited<ReturnType<typeof resolve_descriptions>> = [];
  if (options.describe !== false) {
    const member_files = new Set<string>();
    for (const id of members) {
      const file = deps.adapter.file_of(id as SymbolId);
      if (file !== undefined) member_files.add(file);
    }
    const anchored = deps.adapter.anchored_symbols([...member_files]).filter((a) => members.has(a.symbol_id));
    descriptions = await resolve_descriptions(deps.store, anchored, deps.describe);
  }

  const remap = options.allow_remap ? apply_remap(deps, umbrella.id, member_paths, read_persisted_flows(deps.store)) : undefined;
  const last_synced_at = deps.now();

  write_agentic_substrate(deps.store, { bridges: [], descriptions });
  write_flow(deps.store, {
    id: umbrella.id,
    label: remap?.label ?? umbrella.label,
    seed_paths,
    member_ids: [], // members are induced from the seeds (carried on entry_points), not enumerated
    rationale: `entrypoint '${umbrella.label}' and its reachable subgraph (goal: ${deps.goal ?? "orient-in-code-tree"})`,
    anchor_set: member_paths,
    anchor_set_hash: anchor_set_hash(member_paths),
    last_synced_at,
  });
  restamp_carried_label(deps, umbrella.id, remap);

  return { flow_id: umbrella.id, action: "hydrate", kind: "code", member_count: member_paths.length, last_synced_at };
}
