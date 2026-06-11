/**
 * task-27.1.4 AC#5 — the agentic-substrate writer.
 *
 * Persists the substrate proposal task-27.1.6 assembles — inferred bridges and resolved descriptions —
 * on the agentic lane, honoring the preservation invariant and a hard cost ceiling. The write is
 * scoped (upsert + write_fields, no layer nuke): hydrating one worked-on flow must not disturb other
 * flows or the file-module scaffold (AC#1's lazy, per-flow model). 27.1.6 runs it inside its own
 * `rebuild_layer('agentic')` orchestration only when it owns the complete agentic state to re-emit
 * (the file-module scaffold and flow nodes are written by other mechanisms, so this writer never
 * issues the store-global nuke itself).
 *
 * How a {@link SubstrateProposal} is assembled (the substrate↔agent seam, AC#4):
 *   - bridges: `detect_meta_json_sub_agent_bridges` (and the drift-sync skill's agent-judged stitch
 *     bridges) → `build_bridge_edges` → `proposal.bridges`.
 *   - descriptions: `plan_descriptions` → combine `from_docstring`/`placeholder` into
 *     `ResolvedDescription[]` → `proposal.descriptions`. Agent-authored text arrives through the
 *     drift-reconcile `--apply-descriptions` pass as its own proposal.
 *
 * Preservation: descriptions are agent-generated and written unconditionally at the agentic tier
 * (resurrecting/overwriting; see `write_descriptions`). A bridge differs because its edge can carry a
 * user `adjudication` (a column, not a ladder field): a bridge whose edge is user-owned
 * (`layer='user'` or adjudicated) or soft-deleted is never re-clobbered or resurrected. Cost ceiling:
 * the bridge and description COUNTS are the hard cost bound; `deadline_ms` is a coarse wall-clock guard
 * that gates whether the already-resolved description rows are written. Every truncation is logged and
 * reported (no silent cap).
 */

import type { EdgeRow, GraphStore, ProvenanceRow } from "@code-charter/types";

import { DEFAULT_DESCRIBE_CAP } from "./describe_policy";
import type { ResolvedDescription } from "./write_descriptions";
import { write_descriptions } from "./write_descriptions";

/** Everything the writer persists in one pass. task-27.1.6 assembles this after running the executor. */
export interface SubstrateProposal {
  bridges: ReadonlyArray<{ edge: EdgeRow; provenance: ProvenanceRow[] }>;
  descriptions: readonly ResolvedDescription[];
}

export interface AgenticWriterLimits {
  /** Max bridge edges written per pass. Default 500. */
  max_bridges: number;
  /** Max descriptions written per pass. Default 200 (matches the LLM-described-node cap). */
  max_descriptions: number;
  /** Wall-clock budget; the description phase is skipped once exceeded. Default 30s. */
  deadline_ms: number;
}

export const DEFAULT_AGENTIC_WRITER_LIMITS: AgenticWriterLimits = {
  max_bridges: 500,
  max_descriptions: DEFAULT_DESCRIBE_CAP,
  deadline_ms: 30_000,
};

export interface AgenticWriteReport {
  bridges_written: number;
  descriptions_written: number;
  /** Bridge keys preserved because they are user-owned, adjudicated, or soft-deleted. */
  preserved: string[];
  /** One entry per capped collection. */
  truncated: Array<{ kind: "bridges" | "descriptions"; requested: number; written: number }>;
  /** True when the deadline was hit and the description phase was skipped. */
  hit_deadline: boolean;
}

export interface AgenticWriteOptions {
  limits?: Partial<AgenticWriterLimits>;
  /** Injected clock for the deadline gate. Defaults to `Date.now`. */
  now?: () => number;
  /** Truncation/deadline logger. Defaults to `console.warn`. */
  log?: (message: string) => void;
}

/** Write the substrate proposal scoped (no layer nuke). The lazy, per-flow path. */
export function write_agentic_substrate(
  store: GraphStore,
  proposal: SubstrateProposal,
  options?: AgenticWriteOptions,
): AgenticWriteReport {
  const limits = { ...DEFAULT_AGENTIC_WRITER_LIMITS, ...options?.limits };
  const now = options?.now ?? (() => Date.now());
  const log = options?.log ?? ((message: string) => console.warn(message));

  const report: AgenticWriteReport = {
    bridges_written: 0,
    descriptions_written: 0,
    preserved: [],
    truncated: [],
    hit_deadline: false,
  };
  const started = now();

  // --- bridges ---
  const sorted_bridges = [...proposal.bridges].sort((a, b) =>
    a.edge.key < b.edge.key ? -1 : a.edge.key > b.edge.key ? 1 : 0,
  );
  let bridges = sorted_bridges;
  if (bridges.length > limits.max_bridges) {
    report.truncated.push({ kind: "bridges", requested: bridges.length, written: limits.max_bridges });
    log(`agentic writer: capped bridges ${bridges.length} → ${limits.max_bridges}`);
    bridges = bridges.slice(0, limits.max_bridges);
  }
  const existing_by_key = new Map(store.all_edges({ include_deleted: true }).map((e) => [e.key, e]));
  for (const { edge, provenance } of bridges) {
    const existing = existing_by_key.get(edge.key);
    // Preserve a user-owned edge (promoted layer OR a user adjudication — a column, not a ladder
    // field) and never resurrect a binned one.
    if (existing && (existing.layer === "user" || existing.adjudication !== null || existing.deleted_at !== null)) {
      report.preserved.push(edge.key);
      continue;
    }
    store.upsert_edge(edge, provenance);
    report.bridges_written += 1;
  }

  // --- descriptions (gated by the deadline) ---
  if (now() - started > limits.deadline_ms) {
    report.hit_deadline = true;
    if (proposal.descriptions.length > 0) {
      report.truncated.push({ kind: "descriptions", requested: proposal.descriptions.length, written: 0 });
      log(`agentic writer: deadline ${limits.deadline_ms}ms hit, skipped ${proposal.descriptions.length} descriptions`);
    }
    return report;
  }

  let descriptions = proposal.descriptions;
  if (descriptions.length > limits.max_descriptions) {
    report.truncated.push({ kind: "descriptions", requested: descriptions.length, written: limits.max_descriptions });
    log(`agentic writer: capped descriptions ${descriptions.length} → ${limits.max_descriptions}`);
    descriptions = descriptions.slice(0, limits.max_descriptions);
  }
  const desc_result = write_descriptions(store, descriptions);
  report.descriptions_written = desc_result.written.length;

  return report;
}
