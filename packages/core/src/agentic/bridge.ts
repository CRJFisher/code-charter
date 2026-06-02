/**
 * task-27.1.4 AC#2 — the agentic bridge builder.
 *
 * A bridge is a cross-call-graph link static analysis could not resolve — a registry lookup, a
 * dynamic dispatch, an entrypoint→doc inference. It is written on the agentic lane (`layer='agentic'`,
 * `kind='agentic.bridge'`, lower confidence so it renders distinct) and, crucially, carries an
 * `inference_rationale` in its attributes bag plus provenance whose `source_range` is the
 * registry/entrypoint *definition* span that justifies it. That span satisfies the NOT-NULL
 * `edge_provenance.source_range` and makes click-through land on real source.
 *
 * The builder is span-agnostic: each {@link BridgeCandidate} arrives with its own justifying span
 * (the registry detector computes it). The builder couples the edge with its provenance in one value
 * so a caller cannot persist a bridge without the span that justifies it.
 */

import type { EdgeRow, ProvenanceRow } from "@code-charter/types";

import { BRIDGE_EDGE_KIND } from "../model/flow";

/** Lower than a raw edge's 1.0 — drives the dashed/distinct render of an inferred link. */
export const BRIDGE_CONFIDENCE_INFERRED = 0.5;

/** A justified cross-call-graph link, ready to persist as an `agentic.bridge` edge. */
export interface BridgeCandidate {
  /** The registry consumer / inference source symbol. */
  src_id: string;
  /** The resolved target symbol. */
  dst_id: string;
  /** Human/agent-facing justification; lands in `attributes.inference_rationale`. */
  inference_rationale: string;
  /** The definition span that justifies the edge (satisfies NOT-NULL provenance + click-through). */
  provenance: {
    source_file: string;
    source_range: string;
    extractor_id: string;
    extractor_version: string;
  };
}

/** Deterministic edge key for a bridge, independent of the span it was inferred from. */
export function bridge_edge_key(src_id: string, dst_id: string): string {
  return `${BRIDGE_EDGE_KIND}:${src_id}->${dst_id}`;
}

/**
 * Build the (edge, provenance) pairs for a set of bridge candidates. Output is sorted by edge key so
 * it is byte-stable across runs. Two candidates sharing a (src, dst) collapse to one edge with both
 * provenance spans.
 */
export function build_bridge_edges(
  candidates: readonly BridgeCandidate[],
): Array<{ edge: EdgeRow; provenance: ProvenanceRow[] }> {
  const by_key = new Map<string, { edge: EdgeRow; provenance: ProvenanceRow[] }>();
  for (const candidate of candidates) {
    const key = bridge_edge_key(candidate.src_id, candidate.dst_id);
    const prov: ProvenanceRow = {
      edge_key: key,
      source_file: candidate.provenance.source_file,
      source_range: candidate.provenance.source_range,
      extractor_id: candidate.provenance.extractor_id,
      extractor_version: candidate.provenance.extractor_version,
    };
    const existing = by_key.get(key);
    if (existing) {
      if (
        !existing.provenance.some(
          (p) => p.source_file === prov.source_file && p.source_range === prov.source_range && p.extractor_id === prov.extractor_id,
        )
      ) {
        existing.provenance.push(prov);
      }
      continue;
    }
    by_key.set(key, {
      edge: {
        key,
        src_id: candidate.src_id,
        dst_id: candidate.dst_id,
        kind: BRIDGE_EDGE_KIND,
        confidence: BRIDGE_CONFIDENCE_INFERRED,
        layer: "agentic",
        attributes: { inference_rationale: candidate.inference_rationale },
        field_ownership: {},
        origin: "flow-detector",
        intent_source: "code-edit",
        adjudication: null,
        deleted_at: null,
      },
      provenance: [prov],
    });
  }
  return [...by_key.values()].sort((a, b) => (a.edge.key < b.edge.key ? -1 : a.edge.key > b.edge.key ? 1 : 0));
}
