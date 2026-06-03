/**
 * task-27.1.4 AC#3 — the deterministic-first description policy.
 *
 * When task-27.1.6 hydrates a flow, its member nodes get behaviour descriptions, scoped to that flow.
 * This module owns the *policy* — what gets described, by what means, and what is skipped — purely and
 * deterministically. It makes no model call: the LLM batch is an injected dependency
 * ({@link DescribeBatchExecutor}) that task-27.1.6 fills inside the hydration sub-agent's own run.
 *
 * Policy, in order:
 *   1. Content-hash cache — a member already described at its current `content_hash` is skipped.
 *   2. Docstring-first — a member with an Ariadne docstring uses it verbatim; no LLM call.
 *   3. Batched LLM — the remaining members, up to a per-run cap (default 200), are LLM candidates.
 *   4. Placeholder — members past the cap get the symbol name as a placeholder; no LLM call.
 *
 * The cap counts LLM candidates only; docstring and cached members never consume it. Selection past
 * the cap is by sorted symbol_path so it is byte-stable, and the over-cap count is reported (never a
 * silent cap).
 */

import type { AnyDefinition } from "@code-charter/types";
import { get_docstring } from "@code-charter/types";

/** A flow member presented to the planner: its identity, current content hash, and live definition. */
export interface DescribeMember {
  /** The anchor symbol_path the description attaches to. */
  symbol_path: string;
  /** The member's current content_hash (from its anchor) — the cache key. */
  content_hash: string;
  /** Display name; the over-cap placeholder. */
  name: string;
  /** The live Ariadne definition, read for its native docstring. */
  definition: AnyDefinition;
}

/** What is already persisted for a symbol_path, so the planner can skip unchanged members. */
export interface ExistingDescription {
  /** The content_hash the stored description was generated against. */
  described_at_content_hash: string;
}

export interface DescribePolicyOptions {
  /** Per-run LLM cap; members past it get the name placeholder. Default 200. */
  cap?: number;
  /** symbol_path → already-persisted description metadata, for the content-hash cache skip. */
  existing?: ReadonlyMap<string, ExistingDescription>;
}

export const DEFAULT_DESCRIBE_CAP = 200;

export type DescriptionSource = "docstring" | "llm" | "placeholder";

export interface PlannedDescription {
  symbol_path: string;
  content_hash: string;
  name: string;
  source: DescriptionSource;
  /** Docstring text for `docstring`; the name for `placeholder`; null for `llm` (the executor fills it). */
  text: string | null;
}

export interface DescriptionPlan {
  from_docstring: PlannedDescription[];
  needs_llm: PlannedDescription[];
  placeholder: PlannedDescription[];
  /** symbol_paths skipped because a same-content_hash description is already persisted. */
  cached: string[];
  /** Present only when LLM candidates exceeded the cap. */
  truncation?: { cap: number; over_cap_count: number };
}

function cmp_str(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Partition flow members into docstring / LLM / placeholder / cached buckets (pure, deterministic). */
export function plan_descriptions(
  members: readonly DescribeMember[],
  options?: DescribePolicyOptions,
): DescriptionPlan {
  const cap = options?.cap ?? DEFAULT_DESCRIBE_CAP;
  const existing = options?.existing;

  const cached: string[] = [];
  const from_docstring: PlannedDescription[] = [];
  const llm_candidates: DescribeMember[] = [];

  for (const member of members) {
    if (existing?.get(member.symbol_path)?.described_at_content_hash === member.content_hash) {
      cached.push(member.symbol_path);
      continue;
    }
    const docstring = get_docstring(member.definition);
    if (docstring !== undefined) {
      from_docstring.push({
        symbol_path: member.symbol_path,
        content_hash: member.content_hash,
        name: member.name,
        source: "docstring",
        text: docstring,
      });
      continue;
    }
    llm_candidates.push(member);
  }

  llm_candidates.sort((a, b) => cmp_str(a.symbol_path, b.symbol_path));
  const needs_llm: PlannedDescription[] = [];
  const placeholder: PlannedDescription[] = [];
  llm_candidates.forEach((member, index) => {
    const base = { symbol_path: member.symbol_path, content_hash: member.content_hash, name: member.name };
    if (index < cap) needs_llm.push({ ...base, source: "llm", text: null });
    else placeholder.push({ ...base, source: "placeholder", text: member.name });
  });

  cached.sort(cmp_str);
  from_docstring.sort((a, b) => cmp_str(a.symbol_path, b.symbol_path));
  const plan: DescriptionPlan = { from_docstring, needs_llm, placeholder, cached };
  if (placeholder.length > 0) plan.truncation = { cap, over_cap_count: placeholder.length };
  return plan;
}

/** One unit of LLM description work: identity plus the live definition to read source from. */
export interface DescribeBatchRequest {
  symbol_path: string;
  content_hash: string;
  name: string;
  definition: AnyDefinition;
}

export interface DescribeBatchResult {
  symbol_path: string;
  text: string;
}

/**
 * The injected description executor. task-27.1.4 ships only this type and a no-op; the real batched,
 * cost-bounded model call lives in task-27.1.6's hydration sub-agent.
 */
export type DescribeBatchExecutor = (
  requests: readonly DescribeBatchRequest[],
) => Promise<readonly DescribeBatchResult[]>;

/** A typed no-op executor for tests and hosts without a model — returns no descriptions. */
export const null_describe_executor: DescribeBatchExecutor = () => Promise.resolve([]);
