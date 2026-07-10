#!/usr/bin/env node
/**
 * Tier 2 of the stitch eval harness (task-27.1.6.7): the live feedback loop for the agent's
 * stitching judgement. Per fixture under `__fixtures__/stitch_eval/` (each one Ariadne resolution
 * weakness), it scaffolds a throwaway repo, installs the production `.claude` bundle from
 * `assets/` via `install_drift` (so a `SKILL.md`/`drift-reconciler.md` edit lands in the next run
 * with no manual copying), stages the pending-reconcile set the way the Stop hook would, and
 * drives the REAL `drift-reconciler` sub-agent via `claude -p` with the Stop hook's verbatim
 * instruction. It then reads the resulting store, scores it against the fixture's expectation
 * (semantic, positive: the weakness fixtures collapse to one multi-seed umbrella — with a bridge
 * for the site-recorded shapes, seeds-only for the evidence-less ones; semantic, negative: the
 * control stays two singletons — the false-positive guard), and emits a
 * readable per-fixture report (pass/fail, chosen umbrellas, agent rationale, descriptions).
 *
 * `claude -p` is the executor — not the Agents SDK — because the judgement under measurement is
 * the prose in the installed `.claude` bundle: print mode loads the same skill + sub-agent files
 * production runs, while the SDK would re-encode them as config and diverge from the artifact
 * being tuned. (The SDK is also not a dependency of this repo.)
 *
 * Gated behind STITCH_EVAL_LIVE=1 (it spends real tokens and needs the `claude` CLI authenticated)
 * and excluded from CI: it is an npm script (`npm run stitch_eval [fixture]`), never a jest suite.
 * Tier 1 (`reconcile_stitch_eval.test.ts`) guards the deterministic contract this run rides on.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BRIDGE_EDGE_KIND, DESCRIPTION_NODE_KIND, FLOW_NODE_KIND, open_graph_store } from "@code-charter/core";

import { serialize_pending_reconcile } from "../hooks/pending_reconcile";
import { build_reconcile_instruction } from "../hooks/stop_decision";
import { CLAUDE_CODE_LAYOUT } from "../installer/host_layout";
import { install_drift } from "../installer/install";
import { is_name_restatement } from "../reconcile/description_quality";
import { prompt_hash, write_pins, PROMPT_ASSET_PIN_FILE } from "../reconcile/prompt_assets";

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(PACKAGE_ROOT, "src", "reconcile", "__fixtures__", "stitch_eval");
const HARVESTED_FIXTURES = path.join(PACKAGE_ROOT, "src", "reconcile", "__fixtures__", "stitch_eval_harvested");
const RECONCILE_BIN = path.join(PACKAGE_ROOT, "dist", "bin", "drift_reconcile.js");
const RUNS_DIR = path.join(PACKAGE_ROOT, ".stitch_eval_runs");
const HARVEST_MANIFEST_SCHEMA_VERSION = 1;

const AGENT_TIMEOUT_MS = 15 * 60_000;

export interface FixtureExpectation {
  /** Directory name — the Ariadne weakness the fixture contains. */
  fixture: string;
  /**
   * "stitch" (semantic, positive): the fragments must collapse into the expected umbrellas, each
   * carrying at least one corroborated bridge between its own members. "stitch_seeds_only"
   * (semantic, positive, evidence-less): same collapse but NO bridge is required — the fixture
   * records no unresolved call site anywhere, so a corroborable bridge cannot exist and the bin
   * rejects any the agent claims. "decline" (semantic, negative — the false-positive guard): the
   * independent entrypoints must stay singleton flows with no bridge.
   */
  kind: "stitch" | "stitch_seeds_only" | "decline";
  expected_flow_count: number;
  /**
   * One member-set per umbrella the agent must form, matched to observed multi-seed flows as an
   * exact partition: every expected set equals exactly one observed anchor_set, no observed
   * multi-seed flow goes unmatched, and no two expected sets land on one flow. Set-equality (not
   * coverage) is safe because Tier 1 pins each fixture's complete induced membership. Empty for
   * the "decline" controls — which makes the false-positive guard fall out of the same matcher.
   */
  expected_umbrellas: string[][];
  /**
   * Anchor symbol_paths whose descriptions must be agent-authored, source "llm", AND pass the
   * name-restatement floor (description_quality.ts). Empty for the "decline" controls.
   */
  expected_description_anchors: string[];
  /**
   * Optional per-anchor golden substrings, matched case-insensitively: the precision layer for
   * domain terms a name-echo would lack. Keys must be expected_description_anchors entries.
   */
  expected_description_contains?: Record<string, string[]>;
  /**
   * The deterministic pre-stitch floor: live flows after the no-agent reconcile (fragmented
   * singletons — nothing stitched yet). Scored only by --no-agent; absent for harvested fixtures,
   * whose floor was never pinned.
   */
  expected_pre_stitch_flow_count?: number;
  /** Absolute fixture dir; hand-authored entries default to `FIXTURES/<fixture>`. */
  dir?: string;
  /** The staged pending set; hand-authored entries default to every file in the fixture dir. */
  staged_files?: string[];
}

const EXPECTATIONS: FixtureExpectation[] = [
  {
    fixture: "dynamic_key_dispatch",
    kind: "stitch",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 3,
    expected_umbrellas: [
      [
        "create_handler.ts#handle_create:function",
        "delete_handler.ts#handle_delete:function",
        "dispatcher.ts#dispatch:function",
        "registry.ts#lookup_handler:function",
      ],
    ],
    expected_description_anchors: [
      "create_handler.ts#handle_create:function",
      "delete_handler.ts#handle_delete:function",
      "dispatcher.ts#dispatch:function",
      "registry.ts#lookup_handler:function",
    ],
    expected_description_contains: {
      // "regist" matches registry/registered/registration — precise enough for the domain term,
      // loose enough for natural phrasings.
      "dispatcher.ts#dispatch:function": ["regist"],
    },
  },
  {
    fixture: "untyped_callback_invocation",
    kind: "stitch",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 2,
    expected_umbrellas: [
      ["boot_caller.ts#boot:function", "scheduler.ts#run_scheduled:function", "shutdown_caller.ts#shutdown:function"],
    ],
    expected_description_anchors: [
      "boot_caller.ts#boot:function",
      "scheduler.ts#run_scheduled:function",
      "shutdown_caller.ts#shutdown:function",
    ],
  },
  {
    fixture: "untyped_receiver_method",
    kind: "stitch",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 2,
    expected_umbrellas: [["caller.py#main:function", "caller.py#run_item:function", "processor.py#process:method"]],
    // Description rows persist under the anchor's enclosing-qualified symbol_path, so the method's
    // row lives under `Item.process` while its flow-layer member path is `process`.
    expected_description_anchors: [
      "caller.py#main:function",
      "caller.py#run_item:function",
      "processor.py#Item.process:method",
    ],
  },
  {
    fixture: "interface_method",
    kind: "stitch_seeds_only",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 2,
    expected_umbrellas: [
      ["csv_exporter.ts#export_rows:method", "exporter.ts#run_export:function", "main.ts#export_report:function"],
    ],
    expected_description_anchors: [
      "csv_exporter.ts#CsvExporter.export_rows:method",
      "exporter.ts#run_export:function",
      "main.ts#export_report:function",
    ],
  },
  {
    // The hardest judgement in the suite: the inventory shows ONE orphan with zero unresolved
    // sites, and the fragment to stitch (compute_average) never appears in the inventory at all —
    // the agent must read the orphan's body, follow the barrel re-export, and seed the
    // never-promoted definition itself.
    fixture: "barrel_reexport",
    kind: "stitch_seeds_only",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 1,
    expected_umbrellas: [["report.ts#summarize:function", "stats.ts#compute_average:function"]],
    expected_description_anchors: ["report.ts#summarize:function", "stats.ts#compute_average:function"],
  },
  {
    fixture: "control_unrelated_pair",
    kind: "decline",
    expected_flow_count: 2,
    expected_pre_stitch_flow_count: 2,
    expected_umbrellas: [],
    expected_description_anchors: [],
  },
  {
    // Two independent dynamic-dispatch clusters land in one changed set: the agent must PARTITION
    // — one umbrella per cluster, never a single merged mega-umbrella and never six singletons.
    fixture: "multi_umbrella",
    kind: "stitch",
    expected_flow_count: 2,
    expected_pre_stitch_flow_count: 6,
    expected_umbrellas: [
      [
        "order_registry.ts#lookup_order_handler:function",
        "orders_dispatch.ts#dispatch_order:function",
        "order_open.ts#handle_order_open:function",
        "order_close.ts#handle_order_close:function",
      ],
      [
        "mail_registry.ts#lookup_mail_handler:function",
        "mail_dispatch.ts#dispatch_mail:function",
        "mail_send.ts#send_mail:function",
        "mail_bounce.ts#bounce_mail:function",
      ],
    ],
    expected_description_anchors: [
      "orders_dispatch.ts#dispatch_order:function",
      "mail_dispatch.ts#dispatch_mail:function",
    ],
  },
  {
    // A 4-hop chain where EVERY hop is a registry lookup: evidence for the tail lives more than
    // one read away from the seed, so shallow stitching leaves the tail fragmented.
    fixture: "deep_chain",
    kind: "stitch",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 4,
    expected_umbrellas: [
      [
        "chain_registry.ts#lookup_step:function",
        "step_one.ts#start_chain:function",
        "step_two.ts#stage_two:function",
        "step_three.ts#stage_three:function",
        "step_four.ts#stage_four:function",
      ],
    ],
    expected_description_anchors: ["step_one.ts#start_chain:function", "step_four.ts#stage_four:function"],
  },
  {
    // One hub dispatching to four handlers: breadth — the agent must absorb EVERY leaf, not just
    // the two it happens to read first.
    fixture: "fan_out",
    kind: "stitch",
    expected_flow_count: 1,
    expected_pre_stitch_flow_count: 5,
    expected_umbrellas: [
      [
        "fan_registry.ts#lookup_route:function",
        "router.ts#route:function",
        "handler_alpha.ts#handle_alpha:function",
        "handler_beta.ts#handle_beta:function",
        "handler_gamma.ts#handle_gamma:function",
        "handler_delta.ts#handle_delta:function",
      ],
    ],
    expected_description_anchors: ["router.ts#route:function"],
  },
  {
    // The seeds-only decoy: two orphans with maximal surface similarity (same verb shape, parallel
    // structure, overlapping vocabulary) but no connecting reference anywhere — name similarity is
    // ranking, never evidence, so the correct judgement is decline.
    fixture: "seeds_only_decoy",
    kind: "decline",
    expected_flow_count: 2,
    expected_pre_stitch_flow_count: 2,
    expected_umbrellas: [],
    expected_description_anchors: [],
  },
];

export interface StoreFlows {
  flows: Array<{ id: string; label: string; entry_points: string[]; anchor_set: string[] }>;
  bridges: Array<{ src_id: string; dst_id: string; rationale: string }>;
  descriptions: Map<string, { text: string; source: string }>;
}

function read_store(store_path: string): StoreFlows {
  // A pure reader: read-only so it never competes for the write lock nor runs schema init, and
  // snapshot() so a reconcile committing mid-read cannot tear the flows/bridges pair. A repo the
  // eval never reconciled has no db — that is the empty result, not an error (a read-only open
  // of a missing file throws).
  if (!fs.existsSync(store_path)) {
    return { flows: [], bridges: [], descriptions: new Map() };
  }
  const store = open_graph_store(store_path, { read_only: true });
  try {
    const { nodes, edges } = store.snapshot();
    const flows = nodes
      .filter((n) => n.kind === FLOW_NODE_KIND && n.deleted_at === null)
      .map((n) => ({
        id: n.id,
        label: typeof n.attributes.label === "string" ? n.attributes.label : "",
        entry_points: as_string_array(n.attributes.entry_points),
        anchor_set: as_string_array(n.attributes.anchor_set),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const bridges = edges
      .filter((e) => e.kind === BRIDGE_EDGE_KIND && e.deleted_at === null)
      .map((e) => ({
        src_id: e.src_id,
        dst_id: e.dst_id,
        rationale: typeof e.attributes.inference_rationale === "string" ? e.attributes.inference_rationale : "",
      }));
    const descriptions = new Map<string, { text: string; source: string }>();
    for (const n of nodes) {
      if (n.kind !== DESCRIPTION_NODE_KIND || n.deleted_at !== null) continue;
      descriptions.set(n.id.slice(DESCRIPTION_NODE_KIND.length + 1), {
        text: typeof n.attributes.description === "string" ? n.attributes.description : "",
        source: typeof n.attributes.description_source === "string" ? n.attributes.description_source : "",
      });
    }
    return { flows, bridges, descriptions };
  } finally {
    store.close();
  }
}

function as_string_array(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Source files of one fixture (everything committed in its directory), repo-relative. */
function fixture_files(fixture: string): string[] {
  return fs.readdirSync(path.join(FIXTURES, fixture)).sort();
}

/**
 * Harvested golden cases (docs/contracts/harvested_fixture_manifest.md): each
 * `stitch_eval_harvested/<slug>/fixture.json` becomes one expectation, replayed by the same
 * scaffold/agent/score machinery as the hand-authored array — harvesting is a pure file drop.
 * A malformed or foreign-version manifest is skipped with a note, never a crash.
 */
export function load_harvested_expectations(harvested_root: string = HARVESTED_FIXTURES): FixtureExpectation[] {
  let names: string[];
  try {
    names = fs.readdirSync(harvested_root).sort();
  } catch {
    return [];
  }
  const expectations: FixtureExpectation[] = [];
  for (const name of names) {
    const dir = path.join(harvested_root, name);
    let manifest: unknown;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, "fixture.json"), "utf8"));
    } catch {
      continue; // a dir without a parsable manifest is not a harvested fixture
    }
    if (typeof manifest !== "object" || manifest === null) continue;
    const top = manifest as Record<string, unknown>;
    const detail = top.detail;
    if (top.schema_version !== HARVEST_MANIFEST_SCHEMA_VERSION || typeof detail !== "object" || detail === null) {
      process.stderr.write(`stitch_eval: skipping harvested fixture ${name} (foreign or malformed manifest)\n`);
      continue;
    }
    const expected = detail as Record<string, unknown>;
    const kind = expected.kind;
    if (kind !== "stitch" && kind !== "stitch_seeds_only" && kind !== "decline") {
      process.stderr.write(`stitch_eval: skipping harvested fixture ${name} (unknown kind)\n`);
      continue;
    }
    // The v1 manifest speaks flat single-umbrella vocabulary; it wraps into the umbrella-list
    // shape here. A harvested DECLINE still carries members (the graded run's singleton flows),
    // but a correct decline replay produces zero multi-seed flows — so decline never wraps into
    // an umbrella expectation, mirroring the hand-authored decline shape.
    const members = as_string_array(expected.expected_members);
    expectations.push({
      fixture: name,
      kind,
      expected_flow_count: typeof expected.expected_flow_count === "number" ? expected.expected_flow_count : 1,
      expected_umbrellas: kind !== "decline" && members.length > 0 ? [members] : [],
      expected_description_anchors: as_string_array(expected.expected_description_anchors),
      dir,
      staged_files: as_string_array(expected.files),
    });
  }
  return expectations;
}

/**
 * Scaffold the throwaway repo: fixture source, the production `.claude` bundle, and the staged
 * pending-reconcile set. The Stop hook entry is then stripped from the installed settings — the
 * harness already staged the set itself, and the eval drives exactly one bounded agent run.
 */
export function scaffold_repo(expectation: FixtureExpectation): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), `stitch-eval-live-${expectation.fixture}-`));
  // The manifest never enters the throwaway repo — it is scoring metadata, not fixture source.
  fs.cpSync(expectation.dir ?? path.join(FIXTURES, expectation.fixture), repo, {
    recursive: true,
    filter: (src) => path.basename(src) !== "fixture.json",
  });
  install_drift(repo, CLAUDE_CODE_LAYOUT, PACKAGE_ROOT);

  const settings_path = path.join(repo, CLAUDE_CODE_LAYOUT.settings_file);
  const settings = JSON.parse(fs.readFileSync(settings_path, "utf8")) as Record<string, unknown>;
  delete settings.hooks;
  fs.writeFileSync(settings_path, JSON.stringify(settings, null, 2) + "\n");

  fs.mkdirSync(path.join(repo, ".code-charter"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, ".code-charter", "drift_pending_reconcile.json"),
    serialize_pending_reconcile({ files: expectation.staged_files ?? fixture_files(expectation.fixture), session: null }),
  );
  return repo;
}

interface AgentRun {
  output: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error: Error | undefined;
}

function run_agent(repo: string): AgentRun {
  // haiku by default: the eval runs often (every prompt iteration) and the judgement task is
  // small; STITCH_EVAL_MODEL overrides when fidelity to the production session model matters.
  // The prompt is the Stop hook's verbatim instruction — the production trigger reproduced.
  const model = process.env.STITCH_EVAL_MODEL ?? "haiku";
  const result = spawnSync(
    "claude",
    ["-p", build_reconcile_instruction(), "--permission-mode", "bypassPermissions", "--model", model],
    {
      cwd: repo,
      encoding: "utf8",
      timeout: AGENT_TIMEOUT_MS,
      env: {
        ...process.env,
        CODE_CHARTER_DB: path.join(repo, ".code-charter", "graph.db"),
        DRIFT_RECONCILE_BIN: RECONCILE_BIN,
      },
    },
  );
  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    status: result.status,
    signal: result.signal,
    error: result.error,
  };
}

/** A spawn failure, a timeout kill, and a non-zero exit are different problems — name them apart. */
function describe_run_failure(run: AgentRun, runner: string): string {
  if (run.error !== undefined) return `${runner} failed to spawn: ${run.error.message}`;
  if (run.status === null) {
    return `${runner} killed (signal ${run.signal ?? "?"}) — likely the ${AGENT_TIMEOUT_MS / 60_000}min timeout`;
  }
  return `${runner} exited ${run.status}`;
}

interface FixtureReport {
  fixture: string;
  passed: boolean;
  failures: string[];
  lines: string[];
}

/**
 * The pure scoring core, exported for unit tests over synthetic stores. Umbrella matching is an
 * exact partition — every expected member-set equals exactly one observed multi-seed flow's
 * anchor_set, no observed multi-seed flow goes unmatched, and no flow satisfies two expectations
 * — so a fragmented, merged, or surplus result always fails even when the flow count coincides.
 */
export function score_observed(expectation: FixtureExpectation, observed: StoreFlows): string[] {
  const failures: string[] = [];

  if (observed.flows.length !== expectation.expected_flow_count) {
    failures.push(`expected ${expectation.expected_flow_count} live flow(s), found ${observed.flows.length}`);
  }

  const observed_umbrellas = observed.flows.filter((f) => f.entry_points.length >= 2);
  const claimed = new Set<string>();
  for (const expected_members of expectation.expected_umbrellas) {
    const want = [...expected_members].sort();
    const match = observed_umbrellas.find(
      (flow) => !claimed.has(flow.id) && JSON.stringify([...flow.anchor_set].sort()) === JSON.stringify(want),
    );
    if (match === undefined) {
      failures.push(`no umbrella matches expected member set [${want.join(", ")}] — declined, fragmented, or merged`);
    } else {
      claimed.add(match.id);
    }
  }
  for (const flow of observed_umbrellas) {
    if (!claimed.has(flow.id)) {
      failures.push(`unexpected multi-seed umbrella '${flow.id}' — a merge the fixture does not sanction`);
    }
  }

  if (expectation.kind === "stitch") {
    // seeds_only fixtures record no unresolved site anywhere, so no corroborable bridge can exist
    // — the bin's evidence bar (Tier 1-pinned) rejects any claimed one; only "stitch" demands one,
    // and it must connect the umbrella's own members.
    for (const expected_members of expectation.expected_umbrellas) {
      const members = new Set(expected_members);
      const bridged = observed.bridges.some((b) => members.has(b.src_id) && members.has(b.dst_id));
      if (!bridged) {
        failures.push(`no agentic.bridge within umbrella [${[...members].join(", ")}] (uncorroborated or missing stitch)`);
      }
    }
  }
  if (expectation.kind === "decline" && observed.bridges.length > 0) {
    failures.push(`false positive: ${observed.bridges.length} bridge(s) persisted between independent entrypoints`);
  }

  for (const anchor of expectation.expected_description_anchors) {
    const description = observed.descriptions.get(anchor);
    if (description === undefined || description.source !== "llm" || description.text.trim().length === 0) {
      failures.push(`member ${anchor} has no agent-authored description (${description?.source ?? "absent"})`);
      continue;
    }
    if (is_name_restatement(anchor, description.text)) {
      failures.push(`member ${anchor} description restates its name ("${description.text}") — adds no content`);
    }
    for (const needle of expectation.expected_description_contains?.[anchor] ?? []) {
      if (!description.text.toLowerCase().includes(needle.toLowerCase())) {
        failures.push(`member ${anchor} description misses expected phrase "${needle}"`);
      }
    }
  }

  return failures;
}

function score_fixture(expectation: FixtureExpectation, repo: string, agent_output: string): FixtureReport {
  const observed = read_store(path.join(repo, ".code-charter", "graph.db"));
  const failures = score_observed(expectation, observed);

  // The agent's own judgement record, for the report: the stitch payload it wrote beside the store
  // (absent when it declined to stitch — which is the correct shape for the control).
  let stitch_rationale = "(no stitch.json written)";
  try {
    const stitch = JSON.parse(fs.readFileSync(path.join(repo, ".code-charter", "stitch.json"), "utf8")) as {
      umbrellas?: Array<{ label?: string; rationale?: string }>;
    };
    stitch_rationale =
      (stitch.umbrellas ?? []).map((u) => `'${u.label ?? "?"}': ${u.rationale ?? "?"}`).join("; ") || "(empty umbrellas)";
  } catch {
    /* declined or never reached phase 1 apply */
  }

  const lines: string[] = [];
  const umbrella_count = expectation.expected_umbrellas.length;
  const expected_line =
    expectation.kind === "stitch"
      ? `${umbrella_count} multi-seed umbrella(s), each internally bridged, quality llm descriptions`
      : expectation.kind === "stitch_seeds_only"
        ? `${umbrella_count} multi-seed umbrella(s), seeds-only (no corroborable site exists, no bridge required), quality llm descriptions`
        : `${expectation.expected_flow_count} singleton flows, no umbrella, no bridge`;
  lines.push(`expected: ${expected_line}`);
  for (const flow of observed.flows) {
    lines.push(`flow ${flow.id}  label='${flow.label}'  seeds=${flow.entry_points.length}  members=[${flow.anchor_set.join(", ")}]`);
  }
  for (const bridge of observed.bridges) {
    lines.push(`bridge ${bridge.src_id} -> ${bridge.dst_id}  "${bridge.rationale}"`);
  }
  lines.push(`umbrella rationale: ${stitch_rationale}`);
  for (const [anchor, description] of [...observed.descriptions.entries()].sort()) {
    lines.push(`description [${description.source}] ${anchor}: ${description.text}`);
  }
  lines.push(`agent: ${agent_output.split("\n").at(-1) ?? "(no output)"}`);

  return { fixture: expectation.fixture, passed: failures.length === 0, failures, lines };
}

/**
 * The token-free fast mode: run the DETERMINISTIC reconcile over each fixture and score its
 * pre-stitch floor — the fragmented singleton shape, zero bridges, zero llm descriptions. A green
 * run means the harness plumbing, the installer bundle, and every fixture's resolution gap are
 * healthy; it says NOTHING about stitch/describe judgement (that is the live tiers' job), which
 * is why the report banner replaces the model line.
 */
function score_no_agent(expectation: FixtureExpectation, repo: string): FixtureReport {
  const observed = read_store(path.join(repo, ".code-charter", "graph.db"));
  const failures: string[] = [];
  if (expectation.expected_pre_stitch_flow_count === undefined) {
    // Unreachable for harvested fixtures (main filters them out of --no-agent); a hand-authored
    // fixture landing here is a spec error, not a skip.
    failures.push("no pre-stitch floor pinned — set expected_pre_stitch_flow_count from a --no-agent run's observed count");
  } else if (observed.flows.length !== expectation.expected_pre_stitch_flow_count) {
    failures.push(
      `expected ${expectation.expected_pre_stitch_flow_count} pre-stitch flow(s), found ${observed.flows.length} — the fixture's resolution gap moved`,
    );
  }
  if (observed.bridges.length > 0) {
    failures.push(`deterministic pass persisted ${observed.bridges.length} bridge(s) — it must never stitch`);
  }
  for (const [anchor, description] of observed.descriptions) {
    if (description.source === "llm") {
      failures.push(`deterministic pass authored an llm description for ${anchor} — it must never describe`);
    }
  }
  const lines = observed.flows.map(
    (flow) => `flow ${flow.id}  seeds=${flow.entry_points.length}  members=[${flow.anchor_set.join(", ")}]`,
  );
  return { fixture: expectation.fixture, passed: failures.length === 0, failures, lines };
}

/**
 * haiku is the routine regression gate; any other model marks a deliberate certification run
 * (production-representative), so the archived report is unambiguous about its tier.
 */
export function certification_tier(model: string): string {
  return model === "haiku" ? "" : "   — CERTIFICATION RUN (production-representative)";
}

function run_deterministic(repo: string, staged: readonly string[]): AgentRun {
  const result = spawnSync(
    "node",
    [
      RECONCILE_BIN,
      "--files",
      staged.join(","),
      "--store",
      path.join(repo, ".code-charter", "graph.db"),
      "--repo-root",
      repo,
    ],
    { encoding: "utf8", timeout: AGENT_TIMEOUT_MS },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
    signal: result.signal,
    error: result.error,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes("--update-pins")) {
    write_pins();
    process.stdout.write(`stitch_eval: wrote ${PROMPT_ASSET_PIN_FILE}\n`);
    return;
  }
  const no_agent = argv.includes("--no-agent");
  const only = argv.find((token) => !token.startsWith("--"));

  if (!no_agent) {
    if (process.env.STITCH_EVAL_LIVE !== "1") {
      process.stdout.write(
        "stitch_eval: skipped — set STITCH_EVAL_LIVE=1 (live agent run: spends tokens, needs the `claude` CLI authenticated), or use --no-agent for the token-free deterministic floor\n",
      );
      return;
    }
    if (spawnSync("claude", ["--version"], { encoding: "utf8" }).status !== 0) {
      process.stderr.write("stitch_eval: `claude` CLI not found on PATH — install/authenticate Claude Code first\n");
      process.exit(1);
    }
  }
  if (!fs.existsSync(RECONCILE_BIN)) {
    process.stderr.write("stitch_eval: built bin missing — run `npm run build` first\n");
    process.exit(1);
  }

  const all_expectations = [
    ...EXPECTATIONS,
    ...load_harvested_expectations(process.env.STITCH_EVAL_HARVESTED_DIR || undefined),
  ];
  let selected = only === undefined ? all_expectations : all_expectations.filter((e) => e.fixture === only);
  if (selected.length === 0) {
    process.stderr.write(
      `stitch_eval: unknown fixture '${only}' (known: ${all_expectations.map((e) => e.fixture).join(", ")})\n`,
    );
    process.exit(2);
  }
  if (no_agent) {
    // Harvested fixtures pin no pre-stitch floor, so the fast mode genuinely skips them — a
    // fresh harvest must never turn the token-free gate red.
    const skipped = selected.filter((e) => e.expected_pre_stitch_flow_count === undefined);
    if (skipped.length > 0) {
      process.stdout.write(
        `stitch_eval: skipping ${skipped.length} floor-less fixture(s) under --no-agent: ${skipped.map((e) => e.fixture).join(", ")}\n`,
      );
      selected = selected.filter((e) => e.expected_pre_stitch_flow_count !== undefined);
    }
    if (selected.length === 0) {
      process.stdout.write("stitch_eval: nothing to score — every selected fixture is floor-less\n");
      return;
    }
  }

  const report: string[] = [];
  const stamp = new Date().toISOString();
  report.push(`stitch_eval — ${stamp}`);
  if (no_agent) {
    report.push("MODE: --no-agent — deterministic floor only (fixtures scaffold, index, and fragment as expected).");
    report.push("This run does NOT exercise stitch/describe judgement; the live tiers do.");
  } else {
    const model = process.env.STITCH_EVAL_MODEL ?? "haiku";
    report.push(
      `model: ${model}   ` +
        `skill_md: ${prompt_hash("assets/skills/drift-sync/SKILL.md")}   ` +
        `reconciler_md: ${prompt_hash("assets/agents/drift-reconciler.md")}${certification_tier(model)}`,
    );
  }
  report.push("");

  const results: FixtureReport[] = [];
  for (const expectation of selected) {
    process.stdout.write(`stitch_eval: running ${expectation.fixture} (${no_agent ? "deterministic" : "live agent"})...\n`);
    // One fixture's failure — a scaffold throw, a hung agent, a corrupt store — degrades to a FAIL
    // entry; the rest of the batch still runs and the report still lands.
    let repo: string | undefined;
    try {
      repo = scaffold_repo(expectation);
      if (no_agent) {
        const staged = expectation.staged_files ?? fixture_files(expectation.fixture);
        const deterministic = run_deterministic(repo, staged);
        if (deterministic.status !== 0) {
          results.push({
            fixture: expectation.fixture,
            passed: false,
            failures: [describe_run_failure(deterministic, "deterministic reconcile")],
            lines: deterministic.output.length > 0 ? [deterministic.output] : [],
          });
        } else {
          results.push(score_no_agent(expectation, repo));
        }
      } else {
        const agent = run_agent(repo);
        if (agent.status !== 0) {
          results.push({
            fixture: expectation.fixture,
            passed: false,
            failures: [describe_run_failure(agent, "claude -p")],
            lines: agent.output.length > 0 ? [agent.output] : [],
          });
        } else {
          results.push(score_fixture(expectation, repo, agent.output));
        }
      }
    } catch (error: unknown) {
      results.push({
        fixture: expectation.fixture,
        passed: false,
        failures: [`harness error: ${String(error)}`],
        lines: [],
      });
    } finally {
      if (repo === undefined) {
        /* scaffold never produced a dir */
      } else if (process.env.STITCH_EVAL_KEEP === "1") process.stdout.write(`stitch_eval: kept ${repo}\n`);
      else fs.rmSync(repo, { recursive: true, force: true });
    }
  }

  for (const result of results) {
    report.push(`━━ ${result.fixture} ${"━".repeat(Math.max(2, 50 - result.fixture.length))} ${result.passed ? "PASS" : "FAIL"}`);
    for (const failure of result.failures) report.push(`  ✗ ${failure}`);
    for (const line of result.lines) report.push(`  ${line}`);
    report.push("");
  }
  const passed = results.filter((r) => r.passed);
  report.push(`summary: ${passed.length}/${results.length} PASS${passed.length < results.length ? `  — FAIL: ${results.filter((r) => !r.passed).map((r) => r.fixture).join(", ")}` : ""}`);
  if (passed.length < results.length) {
    report.push("tune: edit assets/skills/drift-sync/SKILL.md or assets/agents/drift-reconciler.md, then re-run");
  }

  const text = report.join("\n") + "\n";
  process.stdout.write(text);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const run_file = path.join(RUNS_DIR, `${stamp.replace(/[:.]/g, "")}.txt`);
  fs.writeFileSync(run_file, text);
  process.stdout.write(`report written: ${path.relative(process.cwd(), run_file)}\n`);

  process.exit(passed.length === results.length ? 0 : 1);
}

main();
