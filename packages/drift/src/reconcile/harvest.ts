/**
 * Manifest derivation for the golden-case harvester (docs/contracts/harvested_fixture_manifest.md):
 * freeze what a graded run persisted into stitch_eval's own FixtureExpectation vocabulary — that
 * scorer is the consumer, so the manifest speaks its language. Pure over already-read inputs; the
 * drift-harvest bin owns all IO.
 */

import type { ReconcileRunRecord } from "./reconcile_log";
import type { FlowDetail, StoreSummary } from "../inspect/summary";

export const HARVEST_MANIFEST_SCHEMA_VERSION = 1;

export type HarvestKind = "stitch" | "stitch_seeds_only" | "decline";

export interface HarvestManifest {
  schema_version: number;
  run_id: string;
  verdict: string;
  reason: string;
  graded_at: string;
  source_repo: string;
  harvested_at: string;
  detail: {
    kind: HarvestKind;
    files: string[];
    expected_flow_count: number;
    expected_members: string[];
    expected_description_anchors: string[];
  };
}

/** The scorer's kind vocabulary, derived mechanically from what the graded run persisted. */
export function derive_kind(flows: StoreSummary["flows"], bridge_count: number): HarvestKind {
  if (bridge_count > 0) return "stitch";
  if (flows.some((flow) => flow.seeds.length >= 2)) return "stitch_seeds_only";
  return "decline";
}

/**
 * Null when the run's outcomes name no live flow: a retire-only or no-op run has nothing to
 * freeze as a positive golden, and silently widening the scope to unrelated flows would mint an
 * expectation the human never blessed.
 */
export function build_manifest(
  record: ReconcileRunRecord,
  grade: { verdict: string; reason: string; graded_at: string },
  source_repo: string,
  harvested_at: string,
  summary: StoreSummary,
  flow_detail: (flow_id: string) => FlowDetail | undefined,
): HarvestManifest | null {
  const run_flow_ids = new Set((record.detail.outcomes ?? []).map((outcome) => outcome.flow_id));
  const scoped = summary.flows.filter((flow) => flow.live && run_flow_ids.has(flow.id));
  if (scoped.length === 0) return null;
  const members = [...new Set(scoped.flatMap((flow) => [...flow.members]))].sort();
  const bridge_count = scoped.reduce((total, flow) => total + flow.bridge_count, 0);
  const description_anchors = new Set<string>();
  for (const flow of scoped) {
    for (const member of flow_detail(flow.id)?.member_descriptions ?? []) {
      if (member.source === "llm") description_anchors.add(member.symbol_path);
    }
  }
  return {
    schema_version: HARVEST_MANIFEST_SCHEMA_VERSION,
    run_id: record.run_id,
    verdict: grade.verdict,
    reason: grade.reason,
    graded_at: grade.graded_at,
    source_repo,
    harvested_at,
    detail: {
      kind: derive_kind(scoped, bridge_count),
      files: [...(record.detail.file_set ?? [])],
      expected_flow_count: scoped.length,
      expected_members: members,
      expected_description_anchors: [...description_anchors].sort(),
    },
  };
}
