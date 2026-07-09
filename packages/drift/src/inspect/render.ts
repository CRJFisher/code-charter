/**
 * Text renderers for the inspect projections. Pure `summary → string[]` (one line per element), so the
 * bin joins with "\n" for stdout and .5's OutputChannel appends the same lines. Kept separate from the
 * collectors so a consumer can render the JSON projection its own way and still share the gathering.
 */

import type { Anomaly, BridgeSummary, DescriptionBreakdown, FlowDetail, FlowSummary, StoreSummary } from "./summary";

function breakdown_line(breakdown: DescriptionBreakdown): string {
  return `docstring ${breakdown.docstring}, llm ${breakdown.llm}, placeholder ${breakdown.placeholder}, none ${breakdown.none}`;
}

function flow_line(flow: FlowSummary): string {
  const state = flow.live ? "live" : "retired";
  const label = flow.label.length > 0 ? ` "${flow.label}"` : "";
  return `  [${state}] ${flow.id}${label} — ${flow.member_count} member(s), ${flow.seeds.length} seed(s), ${flow.bridge_count} bridge(s); descriptions: ${breakdown_line(flow.descriptions)}`;
}

function bridge_line(bridge: BridgeSummary): string {
  const rationale = bridge.rationale.length > 0 ? ` — ${bridge.rationale}` : "";
  return `  ${bridge.src_id} → ${bridge.dst_id}${rationale}`;
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
  for (const bridge of summary.bridges) lines.push(bridge_line(bridge));
  lines.push("");

  lines.push(`deferred retirements: ${summary.deferred_retirements.length}`);
  for (const deferred of summary.deferred_retirements) {
    lines.push(`  ${deferred.flow_id} — ${deferred.reason}`);
  }
  return lines;
}

function render_sync_status_line(summary: StoreSummary): string {
  const status = summary.sync_status;
  if (status === null) return "sync status: (no run log)";
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
    const source = member.source ?? "(none)";
    const text = member.text !== null && member.text.length > 0 ? ` — ${member.text}` : "";
    lines.push(`    [${source}] ${member.symbol_path}${text}`);
  }
  lines.push("");

  lines.push(`  bridges (${detail.bridges.length}):`);
  for (const bridge of detail.bridges) lines.push(`  ${bridge_line(bridge).trimStart()}`);
  return lines;
}

/** The `--lint` render: one line per anomaly, or a clean-bill line. */
export function render_anomalies(anomalies: readonly Anomaly[]): string[] {
  if (anomalies.length === 0) return ["no anomalies detected"];
  return [`${anomalies.length} anomaly(ies):`, ...anomalies.map((anomaly) => `  [${anomaly.code}] ${anomaly.message}`)];
}
