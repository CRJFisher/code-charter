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
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BRIDGE_EDGE_KIND, DESCRIPTION_NODE_KIND, FLOW_NODE_KIND, open_graph_store } from "@code-charter/core";

import { serialize_pending_reconcile } from "../hooks/pending_reconcile";
import { build_reconcile_instruction } from "../hooks/stop_decision";
import { CLAUDE_CODE_LAYOUT } from "../installer/host_layout";
import { install_drift } from "../installer/install";

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(PACKAGE_ROOT, "src", "reconcile", "__fixtures__", "stitch_eval");
const HARVESTED_FIXTURES = path.join(PACKAGE_ROOT, "src", "reconcile", "__fixtures__", "stitch_eval_harvested");
const RECONCILE_BIN = path.join(PACKAGE_ROOT, "dist", "bin", "drift_reconcile.js");
const RUNS_DIR = path.join(PACKAGE_ROOT, ".stitch_eval_runs");
const HARVEST_MANIFEST_SCHEMA_VERSION = 1;

const AGENT_TIMEOUT_MS = 15 * 60_000;

interface FixtureExpectation {
  /** Directory name — the Ariadne weakness the fixture contains. */
  fixture: string;
  /**
   * "stitch" (semantic, positive): the fragments must collapse to one multi-seed umbrella with at
   * least one corroborated bridge. "stitch_seeds_only" (semantic, positive, evidence-less): the
   * fragments must collapse to one multi-seed umbrella but NO bridge is required — the fixture
   * records no unresolved call site anywhere, so a corroborable bridge cannot exist and the bin
   * rejects any the agent claims. "decline" (semantic, negative — the false-positive guard): the
   * independent entrypoints must stay singleton flows with no bridge.
   */
  kind: "stitch" | "stitch_seeds_only" | "decline";
  expected_flow_count: number;
  /**
   * Flow-layer member symbol_paths the umbrella's induced membership must cover. Checked for both
   * positive kinds ("stitch" and "stitch_seeds_only"); empty for the "decline" control.
   */
  expected_members: string[];
  /**
   * Anchor symbol_paths whose descriptions must be agent-authored, source "llm". Checked for both
   * positive kinds ("stitch" and "stitch_seeds_only"); empty for the "decline" control.
   */
  expected_description_anchors: string[];
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
    expected_members: [
      "create_handler.ts#handle_create:function",
      "delete_handler.ts#handle_delete:function",
      "dispatcher.ts#dispatch:function",
      "registry.ts#lookup_handler:function",
    ],
    expected_description_anchors: [
      "create_handler.ts#handle_create:function",
      "delete_handler.ts#handle_delete:function",
      "dispatcher.ts#dispatch:function",
      "registry.ts#lookup_handler:function",
    ],
  },
  {
    fixture: "untyped_callback_invocation",
    kind: "stitch",
    expected_flow_count: 1,
    expected_members: [
      "boot_caller.ts#boot:function",
      "scheduler.ts#run_scheduled:function",
      "shutdown_caller.ts#shutdown:function",
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
    expected_members: [
      "caller.py#main:function",
      "caller.py#run_item:function",
      "processor.py#process:method",
    ],
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
    expected_members: [
      "csv_exporter.ts#export_rows:method",
      "exporter.ts#run_export:function",
      "main.ts#export_report:function",
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
    expected_members: ["report.ts#summarize:function", "stats.ts#compute_average:function"],
    expected_description_anchors: ["report.ts#summarize:function", "stats.ts#compute_average:function"],
  },
  {
    fixture: "control_unrelated_pair",
    kind: "decline",
    expected_flow_count: 2,
    expected_members: [],
    expected_description_anchors: [],
  },
];

interface StoreFlows {
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
    expectations.push({
      fixture: name,
      kind,
      expected_flow_count: typeof expected.expected_flow_count === "number" ? expected.expected_flow_count : 1,
      expected_members: as_string_array(expected.expected_members),
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
function scaffold_repo(expectation: FixtureExpectation): string {
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
function describe_agent_failure(agent: AgentRun): string {
  if (agent.error !== undefined) return `claude -p failed to spawn: ${agent.error.message}`;
  if (agent.status === null) {
    return `claude -p killed (signal ${agent.signal ?? "?"}) — likely the ${AGENT_TIMEOUT_MS / 60_000}min timeout`;
  }
  return `claude -p exited ${agent.status}`;
}

interface FixtureReport {
  fixture: string;
  passed: boolean;
  failures: string[];
  lines: string[];
}

function score_fixture(expectation: FixtureExpectation, repo: string, agent_output: string): FixtureReport {
  const observed = read_store(path.join(repo, ".code-charter", "graph.db"));
  const failures: string[] = [];

  if (observed.flows.length !== expectation.expected_flow_count) {
    failures.push(`expected ${expectation.expected_flow_count} live flow(s), found ${observed.flows.length}`);
  }
  if (expectation.kind === "stitch" || expectation.kind === "stitch_seeds_only") {
    const umbrella = observed.flows.find((f) => f.entry_points.length >= 2);
    if (umbrella === undefined) {
      failures.push("no multi-seed umbrella (no live flow with seeds >= 2) — the agent declined or fragmented");
    } else {
      const missing = expectation.expected_members.filter((m) => !umbrella.anchor_set.includes(m));
      if (missing.length > 0) failures.push(`umbrella misses expected member(s): ${missing.join(", ")}`);
    }
    // seeds_only fixtures record no unresolved site anywhere, so no corroborable bridge can exist
    // — the bin's evidence bar (Tier 1-pinned) rejects any claimed one; only "stitch" demands one.
    if (expectation.kind === "stitch" && observed.bridges.length === 0) {
      failures.push("no agentic.bridge persisted (uncorroborated or missing stitch)");
    }
    for (const anchor of expectation.expected_description_anchors) {
      const description = observed.descriptions.get(anchor);
      if (description === undefined || description.source !== "llm" || description.text.trim().length === 0) {
        failures.push(`member ${anchor} has no agent-authored description (${description?.source ?? "absent"})`);
      }
    }
  } else {
    if (observed.bridges.length > 0) {
      failures.push(`false positive: ${observed.bridges.length} bridge(s) persisted between independent entrypoints`);
    }
    const merged = observed.flows.find((f) => f.entry_points.length >= 2);
    if (merged !== undefined) failures.push(`false positive: independent entrypoints merged into '${merged.id}'`);
  }

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
  const expected_line =
    expectation.kind === "stitch"
      ? "one multi-seed umbrella, >=1 bridge, llm descriptions"
      : expectation.kind === "stitch_seeds_only"
        ? "one multi-seed umbrella, seeds-only (no corroborable site exists, no bridge required), llm descriptions"
        : "two singleton flows, no bridge";
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

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12);
}

function main(): void {
  if (process.env.STITCH_EVAL_LIVE !== "1") {
    process.stdout.write("stitch_eval: skipped — set STITCH_EVAL_LIVE=1 (live agent run: spends tokens, needs the `claude` CLI authenticated)\n");
    return;
  }
  if (spawnSync("claude", ["--version"], { encoding: "utf8" }).status !== 0) {
    process.stderr.write("stitch_eval: `claude` CLI not found on PATH — install/authenticate Claude Code first\n");
    process.exit(1);
  }
  if (!fs.existsSync(RECONCILE_BIN)) {
    process.stderr.write("stitch_eval: built bin missing — run `npm run build` first\n");
    process.exit(1);
  }

  const all_expectations = [...EXPECTATIONS, ...load_harvested_expectations()];
  const only = process.argv[2];
  const selected = only === undefined ? all_expectations : all_expectations.filter((e) => e.fixture === only);
  if (selected.length === 0) {
    process.stderr.write(
      `stitch_eval: unknown fixture '${only}' (known: ${all_expectations.map((e) => e.fixture).join(", ")})\n`,
    );
    process.exit(2);
  }

  const report: string[] = [];
  const stamp = new Date().toISOString();
  report.push(`stitch_eval — ${stamp}`);
  report.push(
    `model: ${process.env.STITCH_EVAL_MODEL ?? "haiku"}   ` +
      `skill_md: ${sha256(path.join(PACKAGE_ROOT, "assets", "skills", "drift-sync", "SKILL.md"))}   ` +
      `reconciler_md: ${sha256(path.join(PACKAGE_ROOT, "assets", "agents", "drift-reconciler.md"))}`,
  );
  report.push("");

  const results: FixtureReport[] = [];
  for (const expectation of selected) {
    process.stdout.write(`stitch_eval: running ${expectation.fixture} (live agent)...\n`);
    // One fixture's failure — a scaffold throw, a hung agent, a corrupt store — degrades to a FAIL
    // entry; the rest of the batch still runs and the report still lands.
    let repo: string | undefined;
    try {
      repo = scaffold_repo(expectation);
      const agent = run_agent(repo);
      if (agent.status !== 0) {
        results.push({
          fixture: expectation.fixture,
          passed: false,
          failures: [describe_agent_failure(agent)],
          lines: agent.output.length > 0 ? [agent.output] : [],
        });
      } else {
        results.push(score_fixture(expectation, repo, agent.output));
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
