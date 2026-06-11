/**
 * The three agentic modes of the `drift-reconcile` bin — the deterministic, store-facing verbs the
 * `drift-sync` skill orchestrates the drift-reconciler sub-agent over (task-27.1.6.6). The judgement
 * lives in the agent; everything here is a dumb read or a scoped write:
 *
 *  - `--list-entrypoints` → {@link build_entrypoint_inventory}: the changed neighbourhood's entrypoint
 *    inventory — every entrypoint Ariadne promoted in the changed files, flagged orphan or not, with
 *    the unresolved call sites in its reachable tree as stitch evidence. Pure read; the deterministic
 *    reconcile (resync/retire/singleton hydration) runs in the same pass via `reconcile()`.
 *  - `--apply-stitch` → {@link apply_stitch}: agent-judged umbrellas hydrate as multi-seed
 *    `CodeUmbrella`s with `agentic.bridge` edges over the missed calls; singleton flows absorbed into
 *    an umbrella are retired. Returns the established flow shape for the describe phase.
 *  - `--apply-descriptions` → {@link apply_descriptions}: agent-authored member descriptions persist
 *    through the scoped substrate writer, upgrading the deterministic placeholders. A byte-identical
 *    re-submission at the member's current content hash is skipped (the description cache); a
 *    different text is a revision and writes.
 *
 * Garbage *content* (an unknown symbol_path, overlapping seeds) is skipped with a stderr diagnostic —
 * the agent is fallible and partial progress beats none. A malformed *contract* (wrong JSON shape) is
 * rejected by the parse helpers and exits 2 in the bin.
 */

import type { CallGraph, CallableNode, SymbolId } from "@ariadnejs/types";
import type { BridgeCandidate } from "@code-charter/core";
import {
  build_symbol_path_index,
  DEFAULT_GAP_OPTIONS,
  file_of_symbol_path,
  find_orphan_entrypoints,
  flow_id_of,
  induce_members,
  reachable_from,
  write_agentic_substrate,
} from "@code-charter/core";
import type { ResolvedDescription } from "@code-charter/core";

import { existing_descriptions } from "./describe";
import { read_persisted_flows } from "./flow_store";
import { hydrate_code_flow } from "./hydrate";
import type { CodeUmbrella } from "./hydrate";
import type { ReconcileDeps } from "./types";

/** Provenance identity for agent-confirmed stitch bridges. */
export const STITCH_EXTRACTOR_ID = "agentic.stitch";
export const STITCH_EXTRACTOR_VERSION = "1";

/**
 * Unresolved = the call contributes no in-graph edge: either Ariadne found no resolution at all, or
 * every resolution lands outside the call graph (e.g. a local variable holding a registry-lookup
 * result) — the same predicate `reachable_from` traverses by. Callback invocations are synthetic,
 * not comprehension gaps.
 */
function is_unresolved_call(call: CallableNode["enclosed_calls"][number], graph: CallGraph): boolean {
  if (call.is_callback_invocation) return false;
  return !call.resolutions.some((r) => graph.nodes.has(r.symbol_id));
}

/**
 * The canonical provenance span (`start_line:start_col-end_line:end_col`, 1-indexed lines,
 * 0-indexed columns) of the unresolved call at `file:line`, or undefined when no unresolved call
 * sits there — the graph-corroboration gate for agent-claimed bridge sites.
 */
function unresolved_call_span(graph: CallGraph, file: string, line: number): string | undefined {
  for (const id of [...graph.nodes.keys()].sort()) {
    const node = graph.nodes.get(id)!;
    if (node.location.file_path !== file) continue;
    for (const call of node.enclosed_calls) {
      if (!is_unresolved_call(call, graph)) continue;
      const loc = call.location;
      if (loc.file_path !== file || loc.start_line !== line) continue;
      return `${loc.start_line}:${loc.start_column}-${loc.end_line}:${loc.end_column}`;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// --list-entrypoints
// ---------------------------------------------------------------------------

export interface UnresolvedSite {
  file: string;
  line: number;
  /** The trimmed source text at the call site (e.g. `handlers[key]()`) — the agent's stitch evidence. */
  source_line: string;
}

export interface InventoryEntrypoint {
  symbol_path: string;
  name: string;
  file: string;
  line: number;
  /** True when no documentation edge links the entrypoint — the spuriously-promoted-fragment signal. */
  is_orphan: boolean;
  unresolved_sites: UnresolvedSite[];
}

export interface EntrypointInventory {
  entrypoints: InventoryEntrypoint[];
}

/**
 * The changed neighbourhood's entrypoint inventory: every call-graph entrypoint defined in a changed
 * file (never the whole repo), flagged orphan when no documentation edge touches it, each carrying the
 * unresolved call sites in its reachable tree. An over-large inventory is reported on stderr — never a
 * silent cap; the agent stitches what it can judge and the rest stay singleton flows.
 */
export function build_entrypoint_inventory(
  deps: ReconcileDeps,
  changed: readonly string[],
  graph: CallGraph,
): EntrypointInventory {
  const changed_set = new Set(changed);
  const orphan_ids = new Set(
    find_orphan_entrypoints(graph, deps.store.all_edges(), DEFAULT_GAP_OPTIONS).map((o) => o.flow_id),
  );

  const entrypoints: InventoryEntrypoint[] = [];
  const seen = new Set<string>();
  for (const entry of [...graph.entry_points].sort()) {
    const node = graph.nodes.get(entry);
    if (!node || node.is_test) continue;
    if (!changed_set.has(node.location.file_path)) continue;
    const symbol_path = flow_id_of(node);
    if (seen.has(symbol_path)) continue; // same-path dedup, mirroring build_skeleton_flows
    seen.add(symbol_path);

    const sites: UnresolvedSite[] = [];
    const tree = reachable_from(entry, graph);
    for (const member of [...tree].sort()) {
      const member_node = graph.nodes.get(member);
      if (!member_node) continue;
      for (const call of member_node.enclosed_calls) {
        if (!is_unresolved_call(call, graph)) continue;
        const file = call.location.file_path;
        const line = call.location.start_line;
        sites.push({ file, line, source_line: deps.adapter.source_line(file, line) ?? call.name });
      }
    }
    sites.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

    entrypoints.push({
      symbol_path,
      name: node.name,
      file: node.location.file_path,
      line: node.location.start_line,
      is_orphan: orphan_ids.has(symbol_path),
      unresolved_sites: sites,
    });
  }
  entrypoints.sort((a, b) => (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));

  if (entrypoints.length > DEFAULT_GAP_OPTIONS.max_per_category) {
    deps.log(
      `list-entrypoints: ${entrypoints.length} entrypoint(s) in the changed neighbourhood (large inventory; ` +
        `stitch what you can judge — the rest stay singleton flows)`,
    );
  }
  return { entrypoints };
}

// ---------------------------------------------------------------------------
// --apply-stitch
// ---------------------------------------------------------------------------

/**
 * One agent-inferred bridge over a missed call. `src_id`/`dst_id` are flow-layer symbol_paths
 * (`dst_id` is by construction one of the umbrella's seeds — membership derives from the seed
 * union; the bridge is the provenance record of the missed call). `file`/`line` name the
 * unresolved call site, copied verbatim from the inventory's `unresolved_sites`; the bin resolves
 * them to the call's exact span so click-through lands on the real missed call.
 */
export interface StitchBridgeInput {
  src_id: string;
  dst_id: string;
  /** The unresolved call site's file. Defaults to the file embedded in `src_id`. */
  file?: string;
  /** The unresolved call site's 1-indexed line, from the inventory. */
  line: number;
  /** Defaults to the umbrella's rationale. */
  rationale?: string;
}

export interface StitchUmbrellaInput {
  label: string;
  /** Seed entrypoint symbol_paths, from the `--list-entrypoints` inventory. */
  seeds: string[];
  bridges?: StitchBridgeInput[];
  rationale: string;
}

export interface ApplyStitchInput {
  umbrellas: StitchUmbrellaInput[];
}

export interface ApplyStitchFlow {
  id: string;
  members: Array<{ symbol_path: string; name: string }>;
}

export interface ApplyStitchResult {
  flows: ApplyStitchFlow[];
}

/** Structural validation of the `--apply-stitch` wire JSON. Returns an error message on a contract breach. */
export function parse_apply_stitch(raw: unknown): { input: ApplyStitchInput } | { error: string } {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { umbrellas?: unknown }).umbrellas)) {
    return { error: "expected { umbrellas: [...] }" };
  }
  const umbrellas: StitchUmbrellaInput[] = [];
  for (const [i, u] of (raw as { umbrellas: unknown[] }).umbrellas.entries()) {
    if (typeof u !== "object" || u === null) return { error: `umbrellas[${i}] is not an object` };
    const { label, seeds, bridges, rationale } = u as Record<string, unknown>;
    if (typeof label !== "string") return { error: `umbrellas[${i}].label is not a string` };
    if (typeof rationale !== "string") return { error: `umbrellas[${i}].rationale is not a string` };
    if (!Array.isArray(seeds) || !seeds.every((s): s is string => typeof s === "string") || seeds.length === 0) {
      return { error: `umbrellas[${i}].seeds is not a non-empty string array` };
    }
    const parsed_bridges: StitchBridgeInput[] = [];
    for (const [j, b] of (Array.isArray(bridges) ? bridges : []).entries()) {
      if (typeof b !== "object" || b === null) return { error: `umbrellas[${i}].bridges[${j}] is not an object` };
      const bridge = b as Record<string, unknown>;
      if (typeof bridge.src_id !== "string" || typeof bridge.dst_id !== "string" || typeof bridge.line !== "number") {
        return { error: `umbrellas[${i}].bridges[${j}] needs string src_id, dst_id and number line` };
      }
      parsed_bridges.push({
        src_id: bridge.src_id,
        dst_id: bridge.dst_id,
        line: bridge.line,
        ...(typeof bridge.file === "string" ? { file: bridge.file } : {}),
        ...(typeof bridge.rationale === "string" ? { rationale: bridge.rationale } : {}),
      });
    }
    umbrellas.push({ label, seeds, rationale, bridges: parsed_bridges });
  }
  return { input: { umbrellas } };
}

/**
 * Hydrate each agent-judged umbrella as a multi-seed `CodeUmbrella` with its `agentic.bridge` edges,
 * and retire the singleton flows it absorbs. Identity stays deterministic: the umbrella id is its
 * dominant (alphabetically-first resolved) seed's symbol_path — never an agent-supplied id. Unknown
 * seeds, duplicate seed claims, and unresolvable bridge endpoints are skipped with a diagnostic.
 * Idempotent: a re-run with identical input upserts the same rows and finds nothing left to retire.
 */
export async function apply_stitch(
  deps: ReconcileDeps,
  input: ApplyStitchInput,
  graph: CallGraph,
): Promise<ApplyStitchResult> {
  const index = build_symbol_path_index(graph);
  const persisted = read_persisted_flows(deps.store);
  const persisted_ids = new Set(persisted.map((f) => f.node.id));
  const claimed = new Set<string>();
  const flows: ApplyStitchFlow[] = [];

  for (const umbrella of input.umbrellas) {
    const seed_paths: string[] = [];
    for (const seed of [...new Set(umbrella.seeds)].sort()) {
      if (!index.has(seed)) {
        deps.log(`apply-stitch: seed not in the live graph, skipped: ${seed}`);
        continue;
      }
      if (claimed.has(seed)) {
        deps.log(`apply-stitch: seed already claimed by an earlier umbrella, skipped: ${seed}`);
        continue;
      }
      seed_paths.push(seed);
    }
    if (seed_paths.length === 0) {
      deps.log(`apply-stitch: umbrella '${umbrella.label}' has no resolvable seeds, skipped`);
      continue;
    }
    for (const seed of seed_paths) claimed.add(seed);

    const bridges: BridgeCandidate[] = [];
    for (const bridge of umbrella.bridges ?? []) {
      if (!index.has(bridge.src_id) || !index.has(bridge.dst_id)) {
        deps.log(`apply-stitch: bridge endpoint not in the live graph, skipped: ${bridge.src_id} -> ${bridge.dst_id}`);
        continue;
      }
      // The evidence bar, enforced: the named file:line must hold a real unresolved call. Its exact
      // span becomes the provenance `source_range` (canonical `start_line:start_col-end_line:end_col`),
      // so click-through lands on the real missed call. A site the graph cannot corroborate is an
      // invented bridge — skipped, never persisted.
      const file = bridge.file ?? file_of_symbol_path(bridge.src_id);
      const span = unresolved_call_span(graph, file, bridge.line);
      if (span === undefined) {
        deps.log(`apply-stitch: no unresolved call at ${file}:${bridge.line}, bridge skipped: ${bridge.src_id} -> ${bridge.dst_id}`);
        continue;
      }
      bridges.push({
        src_id: bridge.src_id,
        dst_id: bridge.dst_id,
        inference_rationale: bridge.rationale ?? umbrella.rationale,
        provenance: {
          source_file: file,
          source_range: span,
          extractor_id: STITCH_EXTRACTOR_ID,
          extractor_version: STITCH_EXTRACTOR_VERSION,
        },
      });
    }

    const code_umbrella: CodeUmbrella = {
      kind: "code",
      id: seed_paths[0], // dominant seed — deterministic identity, never agent-supplied
      label: umbrella.label,
      seeds: seed_paths.map((p) => index.get(p)!),
      bridges,
      rationale: umbrella.rationale,
    };
    await hydrate_code_flow(deps, code_umbrella, graph);

    // Retire the singleton flows this umbrella absorbs: any live persisted flow keyed by a
    // non-dominant seed is now a fragment of the stitched whole.
    for (const seed of seed_paths.slice(1)) {
      if (!persisted_ids.has(seed)) continue;
      deps.store.soft_delete({ kind: "node", id: seed });
      deps.log(`apply-stitch: retired singleton flow ${seed} (absorbed by ${code_umbrella.id})`);
    }

    const members: Array<{ symbol_path: string; name: string }> = [];
    const seen_paths = new Set<string>();
    for (const member of induce_members({ id: code_umbrella.id, seeds: [...code_umbrella.seeds] }, graph)) {
      const node = graph.nodes.get(member as SymbolId);
      if (!node) continue;
      const symbol_path = flow_id_of(node);
      if (seen_paths.has(symbol_path)) continue;
      seen_paths.add(symbol_path);
      members.push({ symbol_path, name: node.name });
    }
    members.sort((a, b) => (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));
    flows.push({ id: code_umbrella.id, members });
  }

  return { flows };
}

// ---------------------------------------------------------------------------
// --apply-descriptions
// ---------------------------------------------------------------------------

export interface ApplyDescriptionsInput {
  descriptions: Array<{ symbol_path: string; text: string }>;
}

export interface ApplyDescriptionsResult {
  written: string[];
  /** symbol_paths skipped: a byte-identical re-submission at the current content hash, or no live anchor. */
  skipped: string[];
}

/** Structural validation of the `--apply-descriptions` wire JSON. */
export function parse_apply_descriptions(raw: unknown): { input: ApplyDescriptionsInput } | { error: string } {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { descriptions?: unknown }).descriptions)) {
    return { error: "expected { descriptions: [...] }" };
  }
  const descriptions: ApplyDescriptionsInput["descriptions"] = [];
  for (const [i, d] of (raw as { descriptions: unknown[] }).descriptions.entries()) {
    if (typeof d !== "object" || d === null) return { error: `descriptions[${i}] is not an object` };
    const { symbol_path, text } = d as Record<string, unknown>;
    if (typeof symbol_path !== "string" || typeof text !== "string") {
      return { error: `descriptions[${i}] needs string symbol_path and text` };
    }
    descriptions.push({ symbol_path, text });
  }
  return { input: { descriptions } };
}

/**
 * Persist agent-authored member descriptions through the scoped substrate writer. The cache skips a
 * byte-identical re-submission at the member's current content hash (unchanged nodes are not
 * re-described every sync); a different text at the same hash is a revision and writes. A
 * symbol_path with no live anchor is skipped with a diagnostic; duplicate symbol_paths in one
 * payload collapse last-wins.
 */
export function apply_descriptions(deps: ReconcileDeps, input: ApplyDescriptionsInput): ApplyDescriptionsResult {
  const by_path = new Map(input.descriptions.map((d) => [d.symbol_path, d]));
  const files = [
    ...new Set(
      [...by_path.keys()]
        .filter((p) => p.includes("#"))
        .map((p) => file_of_symbol_path(p)),
    ),
  ];
  const anchor_by_path = new Map(deps.adapter.anchored_symbols(files).map((a) => [a.symbol_path, a]));
  const existing = existing_descriptions(deps.store);

  const resolved: ResolvedDescription[] = [];
  const skipped: string[] = [];
  for (const item of by_path.values()) {
    const anchor = anchor_by_path.get(item.symbol_path);
    if (anchor === undefined) {
      deps.log(`apply-descriptions: no live anchor for ${item.symbol_path}, skipped`);
      skipped.push(item.symbol_path);
      continue;
    }
    const prior = existing.get(item.symbol_path);
    if (prior?.described_at_content_hash === anchor.content_hash && prior.text === item.text) {
      skipped.push(item.symbol_path);
      continue;
    }
    resolved.push({
      symbol_path: item.symbol_path,
      content_hash: anchor.content_hash,
      file_path: anchor.file_path,
      text: item.text,
      source: "llm",
    });
  }

  write_agentic_substrate(deps.store, { bridges: [], descriptions: resolved }, { log: deps.log });
  return { written: resolved.map((r) => r.symbol_path).sort(), skipped: skipped.sort() };
}
