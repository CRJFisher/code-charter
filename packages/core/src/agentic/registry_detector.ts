/**
 * task-27.1.4 AC#2 — registry-shaped call-edge gap-filling (deterministic half).
 *
 * "Registry-shaped" means an explicit string→symbol map in the source — a route table, a listener
 * registry, or a skill's `meta.json sub_agents[]` — not arbitrary reflection. Resolving such a map is
 * deterministic, so the substrate does it directly and emits `agentic.bridge` candidates carrying the
 * registry declaration's span as provenance. The v1 detector covers `meta.json sub_agents[]` (the
 * skill target). Other registry shapes are added as sibling detector functions producing the same
 * {@link BridgeCandidate} output — never a caller refactor.
 *
 * The non-literal half of AC#2 (entrypoint→doc inference that needs a model) is NOT here: it runs
 * inside task-27.1.6's hydration sub-agent. The injected `resolve_target` is the seam between the
 * literal map (string side) and whatever resolves it to a symbol id.
 */

import { read_sub_agents } from "../extractors/meta_json";
import type { BridgeCandidate } from "./bridge";

export const AGENTIC_REGISTRY_EXTRACTOR_ID = "agentic.registry";
export const AGENTIC_REGISTRY_EXTRACTOR_VERSION = "1";

export interface MetaJsonRegistryInput {
  /** Path to the meta.json, used as the bridge provenance `source_file`. */
  meta_json_path: string;
  /** Raw meta.json text — its sub_agents[] entries supply the declaration spans. */
  meta_json_source: string;
  /** The registry consumer's symbol id — the bridge's `src_id` (e.g. the skill hub). */
  owner_id: string;
  /** Resolve a declared sub-agent name to a target symbol id, or undefined when unresolvable. */
  resolve_target: (sub_agent_name: string) => string | undefined;
}

/**
 * Detect the `meta.json sub_agents[]` registry as cross-call-graph bridge candidates. Each resolvable
 * declaration becomes one candidate from `owner_id` to the resolved target, justified by the entry's
 * span inside meta.json. Unresolvable declarations are skipped deterministically (they surface as gap
 * work-list items elsewhere). Output is sorted by `dst_id` for stability.
 */
export function detect_meta_json_sub_agent_bridges(input: MetaJsonRegistryInput): BridgeCandidate[] {
  const candidates: BridgeCandidate[] = [];
  for (const decl of read_sub_agents(input.meta_json_source)) {
    const dst_id = input.resolve_target(decl.name);
    if (dst_id === undefined) continue;
    candidates.push({
      src_id: input.owner_id,
      dst_id,
      inference_rationale: `meta.json sub_agents[] declares '${decl.name}'`,
      provenance: {
        source_file: input.meta_json_path,
        source_range: decl.source_range,
        extractor_id: AGENTIC_REGISTRY_EXTRACTOR_ID,
        extractor_version: AGENTIC_REGISTRY_EXTRACTOR_VERSION,
      },
    });
  }
  return candidates.sort((a, b) => (a.dst_id < b.dst_id ? -1 : a.dst_id > b.dst_id ? 1 : 0));
}
