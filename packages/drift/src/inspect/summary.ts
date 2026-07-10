/**
 * Pure store-inspection projections: turn a graph snapshot (plus the reconcile run log from .3) into
 * the answer to "did my last sync do what I expected?" — flow inventory, description-source split,
 * bridges with rationale, deferred retirements — and the anomaly set a lint pass raises over them.
 *
 * All logic here is pure over already-read data; the bin owns the IO (opening the store read-only,
 * reading the sidecars). This is the seam the OutputChannel (.5) and drift:dev (.7) reuse: they call
 * the same collectors and render with the same {@link module:render} functions.
 *
 * Membership is read from a flow node's `anchor_set` attribute, NOT from `agentic.flow_member` edges:
 * a pure code flow induces its members and persists no member edges (only linked-doc members get
 * edges), so an edge count would report a code flow as empty. `anchor_set` is the induced-membership
 * snapshot and is the truth for member counts and for scoping a bridge to its flow.
 */

import {
  BRIDGE_EDGE_KIND,
  DESCRIPTION_NODE_KIND,
  FLOW_NODE_KIND,
  type EdgeRow,
  type NodeRow,
} from "@code-charter/core";

import type { ReconcileLogRecord, SyncStatus } from "../reconcile/reconcile_log";
import type { DeferredRetirement, DeferredSkillSync } from "../reconcile/types";

/** Per-flow (or store-wide) tally of member descriptions by their source. */
export interface DescriptionBreakdown {
  docstring: number;
  llm: number;
  /** Name stand-ins awaiting the agent's `--apply-descriptions` upgrade — real text still missing. */
  provisional: number;
  placeholder: number;
  /**
   * Per-flow: members carrying no `agentic.description` side-node. Store-wide: description nodes whose
   * `description_source` is unrecognized/empty. Either way, the residual bucket that makes the buckets
   * always sum to the input count.
   */
  none: number;
}

/** One flow's inspect projection — the row the summary renders. */
export interface FlowSummary {
  id: string;
  label: string;
  /** `false` for a soft-deleted (retired) flow node. */
  live: boolean;
  /** The flow's `entry_points` (seed symbol_paths). */
  seeds: readonly string[];
  /** The full induced membership snapshot (`anchor_set`). */
  members: readonly string[];
  member_count: number;
  bridge_count: number;
  last_synced_at: string | null;
  rationale: string;
  descriptions: DescriptionBreakdown;
}

/** A persisted `agentic.bridge` edge with its inference rationale. */
export interface BridgeSummary {
  src_id: string;
  dst_id: string;
  rationale: string;
}

/** One member's resolved description, for the `--flow` drill-down. */
export interface MemberDescription {
  symbol_path: string;
  source: string | null;
  text: string | null;
}

/** A `--flow <id>` drill-down: the flow row plus its members' descriptions and the bridges it touches. */
export interface FlowDetail extends FlowSummary {
  member_descriptions: readonly MemberDescription[];
  bridges: readonly BridgeSummary[];
}

/** The whole-store summary — the default inspect projection. */
export interface StoreSummary {
  live_flow_count: number;
  retired_flow_count: number;
  /** Live flows first (by id), then retired (by id). */
  flows: readonly FlowSummary[];
  bridges: readonly BridgeSummary[];
  /** Store-wide description-source split across all live `agentic.description` nodes. */
  descriptions: DescriptionBreakdown;
  /** Deferred retirements from the newest run-log record (older ones may have since resolved). */
  deferred_retirements: readonly DeferredRetirement[];
  /** Deferred skill syncs from the newest run-log record (a degraded bundle left its good flow intact). */
  deferred_skill_syncs: readonly DeferredSkillSync[];
  /** The rolling health rollup, or null when no status sidecar exists. */
  sync_status: SyncStatus | null;
}

/** A raw graph snapshot plus the run-log context the summary folds in. */
export interface InspectInput {
  nodes: readonly NodeRow[];
  edges: readonly EdgeRow[];
  /** The newest {@link ReconcileLogRecord}, or null when no run log exists yet. */
  latest_record: ReconcileLogRecord | null;
  sync_status: SyncStatus | null;
}

interface ResolvedDescription {
  source: string;
  text: string;
}

function as_string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function as_string_array(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Map every live `agentic.description` node to its source + text, keyed by the described symbol_path. */
function index_descriptions(nodes: readonly NodeRow[]): Map<string, ResolvedDescription> {
  const by_symbol = new Map<string, ResolvedDescription>();
  for (const node of nodes) {
    if (node.kind !== DESCRIPTION_NODE_KIND || node.deleted_at !== null) continue;
    const symbol_path = node.id.slice(DESCRIPTION_NODE_KIND.length + 1);
    by_symbol.set(symbol_path, {
      source: as_string(node.attributes.description_source),
      text: as_string(node.attributes.description),
    });
  }
  return by_symbol;
}

/** All live `agentic.bridge` edges as summary rows. */
function collect_bridges(edges: readonly EdgeRow[]): BridgeSummary[] {
  return edges
    .filter((edge) => edge.kind === BRIDGE_EDGE_KIND && edge.deleted_at === null)
    .map((edge) => ({
      src_id: edge.src_id,
      dst_id: edge.dst_id,
      rationale: as_string(edge.attributes.inference_rationale),
    }));
}

function empty_breakdown(): DescriptionBreakdown {
  return { docstring: 0, llm: 0, provisional: 0, placeholder: 0, none: 0 };
}

/**
 * Route one description source into its bucket. An undefined resolution (member with no description
 * node) and an unrecognized source both fall to `none`, so the per-flow and store-wide tallies treat
 * an off-spec source identically and the buckets always sum to the input count.
 */
function bump_source(breakdown: DescriptionBreakdown, source: string | undefined): void {
  if (source === "docstring") breakdown.docstring++;
  else if (source === "llm") breakdown.llm++;
  else if (source === "provisional") breakdown.provisional++;
  else if (source === "placeholder") breakdown.placeholder++;
  else breakdown.none++;
}

/** Tally the description sources of a member set against the store's description index. */
function breakdown_for_members(
  members: readonly string[],
  descriptions: Map<string, ResolvedDescription>,
): DescriptionBreakdown {
  const breakdown = empty_breakdown();
  for (const member of members) bump_source(breakdown, descriptions.get(member)?.source);
  return breakdown;
}

/** Bridges whose either endpoint is a member of `members`. */
function bridges_of(members: readonly string[], bridges: readonly BridgeSummary[]): BridgeSummary[] {
  const member_set = new Set(members);
  return bridges.filter((bridge) => member_set.has(bridge.src_id) || member_set.has(bridge.dst_id));
}

function flow_summary(
  node: NodeRow,
  bridges: readonly BridgeSummary[],
  descriptions: Map<string, ResolvedDescription>,
): FlowSummary {
  const members = as_string_array(node.attributes.anchor_set);
  return {
    id: node.id,
    label: as_string(node.attributes.label),
    live: node.deleted_at === null,
    seeds: as_string_array(node.attributes.entry_points),
    members,
    member_count: members.length,
    bridge_count: bridges_of(members, bridges).length,
    last_synced_at: typeof node.attributes.last_synced_at === "string" ? node.attributes.last_synced_at : null,
    rationale: as_string(node.attributes.rationale),
    descriptions: breakdown_for_members(members, descriptions),
  };
}

/** All flow nodes (live + retired), live first then retired, each group ordered by id. */
function flow_nodes(nodes: readonly NodeRow[]): NodeRow[] {
  return nodes
    .filter((node) => node.kind === FLOW_NODE_KIND)
    .sort((a, b) => {
      const a_live = a.deleted_at === null;
      const b_live = b.deleted_at === null;
      if (a_live !== b_live) return a_live ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** Build the whole-store summary from a snapshot + run-log context. */
export function collect_store_summary(input: InspectInput): StoreSummary {
  const descriptions = index_descriptions(input.nodes);
  const bridges = collect_bridges(input.edges);
  const nodes = flow_nodes(input.nodes);
  const flows = nodes.map((node) => flow_summary(node, bridges, descriptions));

  const store_wide = empty_breakdown();
  for (const resolved of descriptions.values()) bump_source(store_wide, resolved.source);

  return {
    live_flow_count: flows.filter((flow) => flow.live).length,
    retired_flow_count: flows.filter((flow) => !flow.live).length,
    flows,
    bridges,
    descriptions: store_wide,
    deferred_retirements: input.latest_record?.deferred_retirements ?? [],
    deferred_skill_syncs: input.latest_record?.deferred_skill_syncs ?? [],
    sync_status: input.sync_status,
  };
}

/** Drill into one flow by id (live or retired), or undefined when no such flow node exists. */
export function collect_flow_detail(input: InspectInput, flow_id: string): FlowDetail | undefined {
  const node = flow_nodes(input.nodes).find((candidate) => candidate.id === flow_id);
  if (node === undefined) return undefined;

  const descriptions = index_descriptions(input.nodes);
  const bridges = collect_bridges(input.edges);
  const base = flow_summary(node, bridges, descriptions);
  const member_descriptions = base.members.map((symbol_path) => {
    const resolved = descriptions.get(symbol_path);
    return {
      symbol_path,
      source: resolved?.source ?? null,
      text: resolved?.text ?? null,
    };
  });
  return { ...base, member_descriptions, bridges: bridges_of(base.members, bridges) };
}

/**
 * A lint finding. `code` is the machine-branchable kind; `message` is the human line. `flow_id` is
 * set for the per-flow findings.
 */
export interface Anomaly {
  code: "empty_flow" | "unpersisted_bridges" | "high_placeholder_ratio";
  message: string;
  flow_id?: string;
}

/**
 * Minimum agentic-owned description count (name-only + llm) before the placeholder-ratio finding
 * fires — below this, a high ratio is noise, not a signal.
 */
export const HIGH_PLACEHOLDER_MIN = 5;
/** name-only / (name-only + llm) at or above this is a "too few real descriptions" finding. */
export const HIGH_PLACEHOLDER_RATIO = 0.5;

/**
 * The bridges a stitch proposal declared across its umbrellas — read leniently, since the sidecar is
 * an agent-written file that may be partial or malformed. Returns null when the file is absent.
 */
export function count_proposed_bridges(stitch_json: string | null): number | null {
  if (stitch_json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stitch_json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return 0;
  const umbrellas = (parsed as { umbrellas?: unknown }).umbrellas;
  if (!Array.isArray(umbrellas)) return 0;
  let total = 0;
  for (const umbrella of umbrellas) {
    const bridges = (umbrella as { bridges?: unknown } | null)?.bridges;
    if (Array.isArray(bridges)) total += bridges.length;
  }
  return total;
}

/**
 * Raise anomalies over a summary:
 *  - `empty_flow` — a live flow with zero induced members.
 *  - `unpersisted_bridges` — the stitch proposal declared bridges but the store persisted none: a
 *    real stitch-persistence regression. A seeds-only proposal (zero declared bridges) is NOT flagged
 *    — zero persisted bridges is the correct outcome there.
 *  - `high_placeholder_ratio` — the store is dominated by name-placeholder descriptions awaiting real
 *    LLM text.
 */
export function detect_anomalies(summary: StoreSummary, proposed_bridges: number | null): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const flow of summary.flows) {
    if (flow.live && flow.member_count === 0) {
      anomalies.push({ code: "empty_flow", flow_id: flow.id, message: `flow ${flow.id} has 0 members` });
    }
  }

  if (proposed_bridges !== null && proposed_bridges > 0 && summary.bridges.length === 0) {
    anomalies.push({
      code: "unpersisted_bridges",
      message: `stitch.json declares ${proposed_bridges} bridge(s) but 0 are persisted — stitch-persistence regression`,
    });
  }

  // Both `provisional` (awaiting the agent pass) and terminal `placeholder` are name-only stand-ins —
  // the union is the "not yet real text" numerator; only `llm` and `docstring` are real descriptions.
  const { provisional, placeholder, llm } = summary.descriptions;
  const name_only = provisional + placeholder;
  const owned = name_only + llm;
  if (owned >= HIGH_PLACEHOLDER_MIN && name_only / owned >= HIGH_PLACEHOLDER_RATIO) {
    const pct = Math.round((name_only / owned) * 100);
    anomalies.push({
      code: "high_placeholder_ratio",
      message: `${name_only}/${owned} agentic descriptions are placeholders (${pct}%) — awaiting real text`,
    });
  }

  return anomalies;
}
