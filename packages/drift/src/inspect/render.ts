/**
 * Text renderers for the inspect projections. Pure `summary → string[]` (one line per element), so the
 * bin joins with "\n" for stdout and .5's OutputChannel appends the same lines. Kept separate from the
 * collectors so a consumer can render the JSON projection its own way and still share the gathering.
 */

import type { SummaryDiff } from "./diff";
import type { Anomaly, BridgeSummary, DescriptionBreakdown, FlowDetail, FlowSummary, StoreSummary } from "./summary";

function breakdown_line(breakdown: DescriptionBreakdown): string {
  return `docstring ${breakdown.docstring}, llm ${breakdown.llm}, placeholder ${breakdown.placeholder}, none ${breakdown.none}`;
}

/** The flow row body, indentation-neutral so both the summary rows and the diff's `+`/`-` markers reuse it. */
function flow_body(flow: FlowSummary): string {
  const state = flow.live ? "live" : "retired";
  const label = flow.label.length > 0 ? ` "${flow.label}"` : "";
  return `[${state}] ${flow.id}${label} — ${flow.member_count} member(s), ${flow.seeds.length} seed(s), ${flow.bridge_count} bridge(s); descriptions: ${breakdown_line(flow.descriptions)}`;
}

function flow_line(flow: FlowSummary): string {
  return `  ${flow_body(flow)}`;
}

/** Indentation-neutral; each caller owns its indent. */
function bridge_line(bridge: BridgeSummary): string {
  const rationale = bridge.rationale.length > 0 ? ` — ${bridge.rationale}` : "";
  return `${bridge.src_id} → ${bridge.dst_id}${rationale}`;
}

/** The default summary render: header, per-flow rows, bridges, deferred retirements. */
export function render_summary(summary: StoreSummary): string[] {
  const lines: string[] = [];
  lines.push(`flows: ${summary.live_flow_count} live, ${summary.retired_flow_count} retired`);
  lines.push(`descriptions: ${breakdown_line(summary.descriptions)}`);
  lines.push(render_sync_status_line(summary));
  lines.push("");

  lines.push("flows:");
  if (summary.flows.length === 0) lines.push("  (none)");
  for (const flow of summary.flows) lines.push(flow_line(flow));
  lines.push("");

  lines.push(`bridges: ${summary.bridges.length}`);
  for (const bridge of summary.bridges) lines.push(`  ${bridge_line(bridge)}`);
  lines.push("");

  lines.push(`deferred retirements: ${summary.deferred_retirements.length}`);
  for (const deferred of summary.deferred_retirements) {
    lines.push(`  ${deferred.flow_id} — ${deferred.reason}`);
  }
  return lines;
}

function render_sync_status_line(summary: StoreSummary): string {
  const status = summary.sync_status;
  if (status === null) return "sync status: (none recorded)";
  const error = status.last_error !== null ? `, last_error ${status.last_error.at} (${status.last_error.message})` : "";
  return `sync status: last_attempt ${status.last_attempt_at ?? "—"}, last_success ${status.last_success_at ?? "—"}${error}`;
}

/** The `--flow <id>` drill-down: the flow's seeds, per-member descriptions, and bridges. */
export function render_flow_detail(detail: FlowDetail): string[] {
  const lines: string[] = [];
  const state = detail.live ? "live" : "retired";
  lines.push(`flow ${detail.id} [${state}]`);
  if (detail.label.length > 0) lines.push(`  label: ${detail.label}`);
  if (detail.rationale.length > 0) lines.push(`  rationale: ${detail.rationale}`);
  lines.push(`  last_synced_at: ${detail.last_synced_at ?? "—"}`);
  lines.push("");

  lines.push(`  seeds (${detail.seeds.length}):`);
  for (const seed of detail.seeds) lines.push(`    ${seed}`);
  lines.push("");

  lines.push(`  members (${detail.member_count}):`);
  for (const member of detail.member_descriptions) {
    const source = member.source ?? "none";
    const text = member.text !== null && member.text.length > 0 ? ` — ${member.text}` : "";
    lines.push(`    [${source}] ${member.symbol_path}${text}`);
  }
  lines.push("");

  lines.push(`  bridges (${detail.bridges.length}):`);
  for (const bridge of detail.bridges) lines.push(`    ${bridge_line(bridge)}`);
  return lines;
}

/** The `--lint` render: one line per anomaly, or a clean-bill line. */
export function render_anomalies(anomalies: readonly Anomaly[]): string[] {
  if (anomalies.length === 0) return ["no anomalies detected"];
  return [`${anomalies.length} anomaly(ies):`, ...anomalies.map((anomaly) => `  [${anomaly.code}] ${anomaly.message}`)];
}

function delta(before: number, after: number): string {
  return before === after ? String(after) : `${before}→${after}`;
}

function breakdown_delta(before: DescriptionBreakdown, after: DescriptionBreakdown): string {
  return `docstring ${delta(before.docstring, after.docstring)}, llm ${delta(before.llm, after.llm)}, placeholder ${delta(before.placeholder, after.placeholder)}, none ${delta(before.none, after.none)}`;
}

/** A changed flow: `~ id: <state>, members A→B, bridges C→D, descriptions ...` — only the fields that moved. */
function changed_flow_line(before: FlowSummary, after: FlowSummary): string {
  const segments: string[] = [];
  if (before.live !== after.live) segments.push(after.live ? "revived" : "retired");
  if (before.member_count !== after.member_count) segments.push(`members ${delta(before.member_count, after.member_count)}`);
  if (before.bridge_count !== after.bridge_count) segments.push(`bridges ${delta(before.bridge_count, after.bridge_count)}`);
  if (before.seeds.length !== after.seeds.length) segments.push(`seeds ${delta(before.seeds.length, after.seeds.length)}`);
  const before_desc = breakdown_line(before.descriptions);
  const after_desc = breakdown_line(after.descriptions);
  if (before_desc !== after_desc) segments.push(`descriptions ${breakdown_delta(before.descriptions, after.descriptions)}`);
  return `  ~ ${after.id}: ${segments.join(", ")}`;
}

/**
 * The `drift-dev` before/after render: added (`+`), retired-or-dropped (`-`), and changed (`~`) flows,
 * the bridge gain/loss, and the store-wide description shift. A no-op reconcile renders one line so the
 * dev sees the deterministic pass touched nothing rather than an empty screen.
 */
export function render_summary_diff(diff: SummaryDiff): string[] {
  if (diff.unchanged) return ["no changes — the reconcile is a no-op for these files"];

  const lines: string[] = [];
  lines.push("flows:");
  if (diff.flows.length === 0) lines.push("  (unchanged)");
  for (const flow of diff.flows) {
    if (flow.before === null && flow.after !== null) lines.push(`  + ${flow_body(flow.after)}`);
    else if (flow.after === null && flow.before !== null) lines.push(`  - ${flow_body(flow.before)}`);
    else if (flow.before !== null && flow.after !== null) lines.push(changed_flow_line(flow.before, flow.after));
  }
  lines.push("");

  lines.push(`bridges: +${diff.bridges.added.length} / -${diff.bridges.removed.length}`);
  for (const bridge of diff.bridges.added) lines.push(`  + ${bridge_line(bridge)}`);
  for (const bridge of diff.bridges.removed) lines.push(`  - ${bridge_line(bridge)}`);
  lines.push("");

  lines.push(`descriptions (store-wide): ${breakdown_delta(diff.descriptions.before, diff.descriptions.after)}`);
  return lines;
}
