/**
 * The HYDRATE branch: build a flow's diagram the first time its code is worked on. Two shapes share one
 * persistence path:
 *
 *  - a SKILL umbrella — a skill bundle (SKILL.md + scripts + references + sub-agents). Its members are
 *    the bundle's doc nodes (the literal extractor already wrote them); its bridges are the agentic
 *    `meta.json sub_agents[]` links. The skill-dir boundary is the ground-truth signal.
 *  - a CODE umbrella — a deterministic skeleton flow (one entrypoint tree) upgraded in place: its
 *    members are the call-graph reachable subgraph, its descriptions come from the deterministic-first
 *    describe step.
 *
 * A flow's id is its dominant seed's `symbol_path`, stable across body edits. Bridges and descriptions
 * are persisted through {@link write_agentic_substrate} — the cost-bounded substrate writer — and the
 * `agentic.flow` node + member edges through {@link write_flow}; both are scoped (no store-global
 * `rebuild_layer`). Each write stamps `last_synced_at`.
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

import { write_flow } from "./flow_store";
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
  /** Agent-inferred bridges to write alongside this flow (stitch path only). */
  bridges?: readonly BridgeCandidate[];
  /** Agent-authored rationale for the flow grouping (stitch path only). */
  rationale?: string;
}

export type Umbrella = SkillUmbrella | CodeUmbrella;

export interface HydrateOptions {
  /** Run the (cost-bearing) describe step. False for the singleton-stub overflow above the cap (AC#8). */
  describe?: boolean;
}

export async function hydrate_skill_flow(
  deps: ReconcileDeps,
  umbrella: SkillUmbrella,
): Promise<FlowOutcome> {
  const member_ids = [...umbrella.doc_node_ids].sort();
  const last_synced_at = deps.now();

  const proposal: SubstrateProposal = { bridges: build_skill_bridges(umbrella), descriptions: [] };
  write_agentic_substrate(deps.store, proposal);
  write_flow(deps.store, {
    id: umbrella.id,
    label: umbrella.label,
    seed_paths: [umbrella.skill_doc_id],
    member_ids,
    rationale: `skill bundle '${umbrella.label}' grouped as one flow`,
    anchor_set: member_ids,
    last_synced_at,
  });

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

  // Deterministic describe over the flow's member files, persisted (with the cost ceiling) through
  // the substrate writer. A member relocated this turn was already re-anchored inline by re_extract
  // (description and cache key re-keyed to the new symbol_path), so it resolves as a content-hash cache
  // hit here. Skipped for the singleton-stub overflow above the per-turn cap (AC#8). Agent-authored
  // text lands later through `--apply-descriptions`, never through this path.
  let descriptions: ReturnType<typeof resolve_descriptions> = [];
  if (options.describe !== false) {
    const member_files = new Set<string>();
    for (const id of members) {
      const file = deps.adapter.file_of(id as SymbolId);
      if (file !== undefined) member_files.add(file);
    }
    const anchored = deps.adapter
      .anchored_symbols([...member_files])
      .filter((a) => members.has(a.symbol_id));
    descriptions = resolve_descriptions(deps.store, anchored);
  }

  const last_synced_at = deps.now();

  const bridges = build_bridge_edges(umbrella.bridges ?? []);
  write_agentic_substrate(deps.store, { bridges, descriptions });
  const default_rationale = `entrypoint '${umbrella.label}' and its reachable subgraph (goal: ${deps.goal ?? "orient-in-code-tree"})`;
  write_flow(deps.store, {
    id: umbrella.id,
    label: umbrella.label,
    seed_paths,
    member_ids: [], // members are induced from the seeds (carried on entry_points), not enumerated
    rationale: umbrella.rationale ?? default_rationale,
    anchor_set: member_paths,
    last_synced_at,
  });

  return { flow_id: umbrella.id, action: "hydrate", kind: "code", member_count: member_paths.length, last_synced_at };
}
