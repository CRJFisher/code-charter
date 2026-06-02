/**
 * task-27.1.4 AC#5 — the agentic-substrate writer.
 *
 * Persists the substrate proposal task-27.1.6 assembles — inferred bridges and resolved descriptions —
 * on the agentic lane, honoring the preservation invariant and a hard cost ceiling.
 *
 * Two forms, same write logic:
 *   - {@link write_agentic_substrate} writes scoped (upsert + write_fields, no nuke). This is the lazy,
 *     per-worked-on-flow path (AC#1): hydrating one flow must not disturb other flows or the
 *     file-module scaffold.
 *   - {@link rebuild_agentic_substrate} runs the same logic inside `rebuild_layer('agentic')` for a
 *     periodic full rebuild. `rebuild_layer` is store-global (it nukes every live agentic row,
 *     including the scaffold), so the caller must re-emit everything — use it only for a full pass.
 *
 * Preservation: descriptions go through the ladder (a user-owned description is skipped); a bridge
 * whose edge was promoted to `layer='user'` or soft-deleted into the re-attachment bin is never
 * re-clobbered or resurrected. Cost ceiling: bridge and description counts are capped, and a deadline
 * gates the description phase; every truncation is logged and reported (no silent cap).
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
  /** Bridge keys / description symbol_paths preserved because they are user-owned or binned. */
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
    if (existing && (existing.layer === "user" || existing.deleted_at !== null)) {
      report.preserved.push(edge.key); // user-owned or binned — never clobber or resurrect
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
  report.preserved.push(...desc_result.skipped);

  return report;
}

/** Run the same write inside `rebuild_layer('agentic')` — the full-rebuild form (AC#5). */
export function rebuild_agentic_substrate(
  store: GraphStore,
  proposal: SubstrateProposal,
  options?: AgenticWriteOptions,
): AgenticWriteReport {
  let report: AgenticWriteReport | undefined;
  store.rebuild_layer("agentic", (s) => {
    report = write_agentic_substrate(s, proposal, options);
  });
  if (report === undefined) throw new Error("rebuild_layer did not run its writer");
  return report;
}
