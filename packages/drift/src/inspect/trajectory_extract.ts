/**
 * Drift- and transcript-aware extraction of the trajectory spine
 * (docs/contracts/trajectory_spine.md): joins one reconcile run record to the session transcript
 * that produced it and assembles the neutral four-kind spine. This module is the drift-aware side
 * of the extraction/rendering boundary named in trajectory_schema.ts — it may import reconcile
 * and store internals; the renderer may not.
 *
 * Every transcript access is defensive and every failure tier degrades to the effect-only view
 * with an availability marker — a rotated transcript or a host-format change must never turn a
 * read-only inspect into an error. Transcript lines use the host's own camelCase keys
 * (`message.content`, `toolUseResult.agentId`, `timestamp`); the snake_case house rule governs
 * only fields this package owns.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { is_record } from "../hooks/hook_payloads";
import { derive_subagent_transcript_path } from "../hooks/transcript_path";
import { read_latest_reconcile_record, type ReconcileRunRecord } from "../reconcile/reconcile_log";
import { collect_store_summary, type BridgeSummary } from "./summary";
import { read_inspect_input } from "./read_input";
import {
  SPINE_SCHEMA_VERSION,
  type AvailabilityTier,
  type SpineStep,
  type SpineStepKind,
  type TrajectorySpine,
} from "./trajectory_schema";

/** One drift-reconciler launch found in the main transcript. */
export interface ReconcilerSpan {
  tool_use_id: string;
  agent_id: string | null;
  launch_at: string | null;
  result_at: string | null;
}

const RECONCILER_SUBAGENT_TYPE = "drift-reconciler";
/** The launcher tool has carried both names across host versions. */
const LAUNCHER_TOOL_NAMES: ReadonlySet<string> = new Set(["Task", "Agent"]);
const TARGET_MAX_LENGTH = 200;

function parse_lines(text: string): unknown[] {
  const records: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // a torn or foreign line never breaks the walk
    }
  }
  return records;
}

function content_items(line: unknown): Record<string, unknown>[] {
  if (!is_record(line) || !is_record(line.message)) return [];
  const content = line.message.content;
  if (!Array.isArray(content)) return [];
  return content.filter(is_record);
}

function line_timestamp(line: unknown): string | null {
  return is_record(line) && typeof line.timestamp === "string" ? line.timestamp : null;
}

/**
 * Find the reconciler launch this record belongs to. Primary anchor: the launch/result window
 * that contains the record's completion time (the reconcile bin runs INSIDE the sub-agent span,
 * so a completed run's timestamp falls between launch and result). Fallbacks: the latest launch
 * at or before the record time, then the last launch in file order — best-effort when timestamps
 * are absent, never a hard failure.
 */
export function find_reconciler_span(main_transcript_text: string, record_timestamp: string): ReconcilerSpan | null {
  const lines = parse_lines(main_transcript_text);
  const spans: ReconcilerSpan[] = [];
  for (const line of lines) {
    if (!is_record(line) || line.type !== "assistant") continue;
    for (const item of content_items(line)) {
      if (
        item.type === "tool_use" &&
        typeof item.name === "string" &&
        LAUNCHER_TOOL_NAMES.has(item.name) &&
        typeof item.id === "string" &&
        is_record(item.input) &&
        item.input.subagent_type === RECONCILER_SUBAGENT_TYPE
      ) {
        spans.push({ tool_use_id: item.id, agent_id: null, launch_at: line_timestamp(line), result_at: null });
      }
    }
  }
  if (spans.length === 0) return null;

  for (const line of lines) {
    if (!is_record(line) || line.type !== "user") continue;
    for (const item of content_items(line)) {
      if (item.type !== "tool_result" || typeof item.tool_use_id !== "string") continue;
      const span = spans.find((s) => s.tool_use_id === item.tool_use_id);
      if (span === undefined) continue;
      span.result_at = line_timestamp(line);
      const tool_use_result = line.toolUseResult;
      if (is_record(tool_use_result) && typeof tool_use_result.agentId === "string") {
        span.agent_id = tool_use_result.agentId;
      }
    }
  }

  const record_ms = Date.parse(record_timestamp);
  const parse = (value: string | null): number => (value === null ? NaN : Date.parse(value));
  const containing = spans.filter((s) => {
    const launch = parse(s.launch_at);
    const result = parse(s.result_at);
    return !Number.isNaN(launch) && !Number.isNaN(result) && launch <= record_ms && record_ms <= result;
  });
  if (containing.length > 0) return containing[containing.length - 1];
  const before = spans.filter((s) => {
    const launch = parse(s.launch_at);
    return !Number.isNaN(launch) && launch <= record_ms;
  });
  if (before.length > 0) return before[before.length - 1];
  return spans[spans.length - 1];
}

/** A context step's raw tuple before it becomes a SpineStep. */
export interface ContextTuple {
  tool: string;
  target: string;
  at: string | null;
}

/**
 * The salience rule: tool name + target only, never payloads. The target is the tool's one
 * addressing field; everything else in the input (file contents, edit strings, flags) stays out
 * of the spine by construction.
 */
function target_of(input: Record<string, unknown>): string {
  for (const key of ["file_path", "notebook_path", "pattern", "command", "path", "url", "skill", "query"]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value.length > TARGET_MAX_LENGTH ? `${value.slice(0, TARGET_MAX_LENGTH)}…` : value;
    }
  }
  return "";
}

export function parse_context_steps(subagent_transcript_text: string): ContextTuple[] {
  const tuples: ContextTuple[] = [];
  for (const line of parse_lines(subagent_transcript_text)) {
    if (!is_record(line) || line.type !== "assistant") continue;
    for (const item of content_items(line)) {
      if (item.type !== "tool_use" || typeof item.name !== "string") continue;
      tuples.push({
        tool: item.name,
        target: is_record(item.input) ? target_of(item.input) : "",
        at: line_timestamp(line),
      });
    }
  }
  return tuples;
}

/** One stitch umbrella's judgement, parsed leniently off the sidecar (absent pieces degrade). */
export interface StitchJudgement {
  label: string;
  seed_count: number;
  rationale: string;
}

export function parse_stitch_umbrellas(stitch_json: string | null): StitchJudgement[] {
  if (stitch_json === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stitch_json);
  } catch {
    return [];
  }
  if (!is_record(parsed) || !Array.isArray(parsed.umbrellas)) return [];
  return parsed.umbrellas.filter(is_record).map((umbrella) => ({
    label: typeof umbrella.label === "string" ? umbrella.label : "?",
    seed_count: Array.isArray(umbrella.seeds) ? umbrella.seeds.length : 0,
    rationale: typeof umbrella.rationale === "string" ? umbrella.rationale : "",
  }));
}

/** Everything build_trajectory_spine needs, already read — IO stays in the wrapper and the bin. */
export interface TrajectoryInputs {
  record: ReconcileRunRecord;
  /** Null when the transcript file is missing or unreadable. */
  main_transcript_text: string | null;
  read_subagent_transcript: (agent_id: string) => string | null;
  /** Fallback join when the launch's tool_result carried no agentId: resolve by toolUseId. */
  find_agent_by_tool_use: (tool_use_id: string) => string | null;
  stitch_json: string | null;
  bridges: readonly BridgeSummary[];
  /** Stitch umbrellas are trusted only for the newest record — the sidecar is per-run overwritten. */
  is_latest_record: boolean;
}

interface ContextResolution {
  tuples: ContextTuple[] | null;
  tier: AvailabilityTier | null;
  note: string;
}

function resolve_context(inputs: TrajectoryInputs): ContextResolution {
  const { record } = inputs;
  if (record.session_id === null) {
    return { tuples: null, tier: "no_session", note: "transcript unavailable: hand-invoked run has no session" };
  }
  if (record.transcript_path === undefined) {
    return { tuples: null, tier: "path_not_recorded", note: "transcript unavailable: no transcript path recorded" };
  }
  if (inputs.main_transcript_text === null) {
    return {
      tuples: null,
      tier: "file_missing",
      note: `transcript unavailable: ${record.transcript_path} missing (rotated?)`,
    };
  }
  const span = find_reconciler_span(inputs.main_transcript_text, record.timestamp);
  if (span === null) {
    return {
      tuples: null,
      tier: "no_reconciler_span",
      note: "transcript unavailable: no drift-reconciler launch found in the transcript",
    };
  }
  const agent_id = span.agent_id ?? inputs.find_agent_by_tool_use(span.tool_use_id);
  const subagent_text = agent_id === null ? null : inputs.read_subagent_transcript(agent_id);
  if (subagent_text === null) {
    return {
      tuples: null,
      tier: "subagent_file_missing",
      note: "transcript unavailable: the reconciler sub-agent transcript is missing",
    };
  }
  return { tuples: parse_context_steps(subagent_text), tier: null, note: "" };
}

export function build_trajectory_spine(inputs: TrajectoryInputs): TrajectorySpine {
  const { record } = inputs;
  const notes: string[] = [];
  const context = resolve_context(inputs);

  const steps: Array<{ kind: SpineStepKind; at: string | null; summary: string; detail: Record<string, unknown> }> =
    [];
  if (record.instruction !== null) {
    steps.push({ kind: "instruction", at: null, summary: record.instruction, detail: {} });
  }
  for (const tuple of context.tuples ?? []) {
    steps.push({
      kind: "context",
      at: tuple.at,
      summary: tuple.target.length > 0 ? `${tuple.tool} ${tuple.target}` : tuple.tool,
      detail: { tool: tuple.tool, target: tuple.target },
    });
  }
  if (inputs.is_latest_record) {
    for (const umbrella of parse_stitch_umbrellas(inputs.stitch_json)) {
      steps.push({
        kind: "judgement",
        at: null,
        summary: `stitch "${umbrella.label}" (${umbrella.seed_count} seed(s)): ${umbrella.rationale}`,
        detail: { judgement_kind: "stitch", ...umbrella },
      });
    }
  } else if (inputs.stitch_json !== null) {
    notes.push("stitch.json judgement omitted: the sidecar reflects only the newest run");
  }
  for (const bridge of inputs.bridges) {
    steps.push({
      kind: "judgement",
      at: null,
      summary: `bridge ${bridge.src_id} -> ${bridge.dst_id}: ${bridge.rationale}`,
      detail: { judgement_kind: "bridge", ...bridge },
    });
  }
  // `?? []` / zeroed counts: is_current_record admits any record whose detail is an object, so a
  // thin detail must degrade like summary.ts does, not throw (the never-errors bar).
  for (const outcome of record.detail.outcomes ?? []) {
    steps.push({
      kind: "effect",
      at: null,
      summary: `${outcome.action} ${outcome.flow_id} (${outcome.kind}, ${outcome.member_count} member(s)): ${outcome.reason}`,
      detail: { effect_kind: "flow_outcome", ...outcome },
    });
  }
  const counts = record.detail.description_counts ?? { docstring: 0, provisional: 0, placeholder: 0, llm: 0 };
  steps.push({
    kind: "effect",
    at: null,
    summary: `described: docstring ${counts.docstring}, llm ${counts.llm}, provisional ${counts.provisional}, placeholder ${counts.placeholder}`,
    detail: { effect_kind: "describe_tally", counts },
  });

  // Key insertion order deliberately mirrors the contract doc's tables — the order is not
  // wire-normative, but matching it keeps the doc's examples byte-predictive.
  const envelope_detail: Record<string, unknown> = { mode: record.detail.mode };
  if (context.tier !== null) envelope_detail.availability_tier = context.tier;
  envelope_detail.notes = notes;
  return {
    schema_version: SPINE_SCHEMA_VERSION,
    run_id: record.run_id,
    session_id: record.session_id,
    timestamp: record.timestamp,
    transcript_available: context.tier === null,
    availability_note: context.note,
    steps: steps.map(
      (step, ordinal) =>
        ({ kind: step.kind, ordinal, at: step.at, summary: step.summary, detail: step.detail }) satisfies SpineStep,
    ),
    detail: envelope_detail,
  };
}

function read_or_null(file_path: string): string | null {
  try {
    return fs.readFileSync(file_path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The meta.json fallback join: when the launch's tool_result carried no agentId, scan the
 * session's subagents dir for the meta whose toolUseId matches the launch.
 */
function agent_id_from_metas(transcript_path: string, tool_use_id: string): string | null {
  const subagents_dir = path.join(transcript_path.replace(/\.jsonl$/, ""), "subagents");
  let names: string[];
  try {
    names = fs.readdirSync(subagents_dir);
  } catch {
    return null;
  }
  for (const name of names) {
    const match = /^agent-(.+)\.meta\.json$/.exec(name);
    if (match === null) continue;
    try {
      const meta: unknown = JSON.parse(fs.readFileSync(path.join(subagents_dir, name), "utf8"));
      if (is_record(meta) && meta.toolUseId === tool_use_id) return match[1];
    } catch {
      // an unreadable meta never blocks the others
    }
  }
  return null;
}

/** The IO wrapper the bin calls: reads transcript, sidecar, and store, then assembles the spine. */
export function extract_trajectory_spine(store_path: string, record: ReconcileRunRecord): TrajectorySpine {
  const transcript_path = record.transcript_path;
  const stitch_json = read_or_null(path.join(path.dirname(store_path), "stitch.json"));
  const bridges = collect_store_summary(read_inspect_input(store_path)).bridges;
  const latest = read_latest_reconcile_record(store_path);
  return build_trajectory_spine({
    record,
    main_transcript_text: transcript_path === undefined ? null : read_or_null(transcript_path),
    read_subagent_transcript: (agent_id) =>
      transcript_path === undefined ? null : read_or_null(derive_subagent_transcript_path(transcript_path, agent_id)),
    find_agent_by_tool_use: (tool_use_id) =>
      transcript_path === undefined ? null : agent_id_from_metas(transcript_path, tool_use_id),
    stitch_json,
    bridges,
    is_latest_record: latest !== null && latest.run_id === record.run_id,
  });
}
