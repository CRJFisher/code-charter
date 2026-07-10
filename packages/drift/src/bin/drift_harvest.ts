#!/usr/bin/env node
/**
 * The golden-case harvester: freeze a graded reconcile run into a stitch_eval fixture
 * (docs/contracts/harvested_fixture_manifest.md). It copies the run's changed file set (plus any
 * `--extra` paths the flow needs to resolve standalone) out of the source repo, derives the
 * expected outcome from the store the graded run produced — in stitch_eval's own
 * FixtureExpectation vocabulary, since that scorer is the consumer — and writes fixture.json
 * with the provenance that makes a later regression traceable to the human judgement that
 * minted it.
 *
 * Only `good` runs harvest: the expectation asserts "the agent reproduces the human-blessed
 * judgement", which is a valid positive golden only for a good verdict. Ungraded/bad/mixed runs
 * are refused with exit 1. Fixture dir names derive from the run_id, so a re-harvest rewrites
 * the same fixture — idempotent by construction.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { read_grades } from "../reconcile/grade_log";
import { read_reconcile_record_by_run_id, type ReconcileRunRecord } from "../reconcile/reconcile_log";
import { collect_flow_detail, collect_store_summary, type InspectInput, type StoreSummary } from "../inspect/summary";
import { read_inspect_input } from "../inspect/read_input";

const USAGE =
  "usage: drift-harvest --store <db_path> --repo-root <abs> --run <run_id> --out <fixtures_dir> [--slug <name>] [--extra <a,b,...>]";

/** Embedded source is permanent git history — keep harvested slices small and deliberate. */
const MAX_FIXTURE_BYTES = 128 * 1024;

// Not exported: this bin runs main() at load, so importing it executes it — the manifest shape
// is pinned by the contract doc and re-parsed by stitch_eval's own loader.
const HARVEST_MANIFEST_SCHEMA_VERSION = 1;

interface Args {
  store: string;
  repo_root: string;
  run_id: string;
  out: string;
  slug: string | undefined;
  extra: string[];
}

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: { store?: string; repo_root?: string; run?: string; out?: string; slug?: string; extra?: string } = {};
  const FLAGS: Record<string, keyof typeof raw> = {
    "--store": "store",
    "--repo-root": "repo_root",
    "--run": "run",
    "--out": "out",
    "--slug": "slug",
    "--extra": "extra",
  };
  for (let i = 0; i < argv.length; i++) {
    const field = FLAGS[argv[i]];
    if (field === undefined) return { error: `unknown argument: ${argv[i]}` };
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return { error: `missing value for ${argv[i]}` };
    raw[field] = value;
    i++;
  }
  if (raw.store === undefined) return { error: "missing required --store" };
  if (raw.repo_root === undefined) return { error: "missing required --repo-root" };
  if (raw.run === undefined) return { error: "missing required --run" };
  if (raw.out === undefined) return { error: "missing required --out" };
  return {
    args: {
      store: raw.store,
      repo_root: raw.repo_root,
      run_id: raw.run,
      out: raw.out,
      slug: raw.slug,
      extra: (raw.extra ?? "").split(",").map((p) => p.trim()).filter((p) => p.length > 0),
    },
  };
}

/** The scorer's kind vocabulary, derived mechanically from what the graded run persisted. */
function derive_kind(flows: StoreSummary["flows"], bridge_count: number): "stitch" | "stitch_seeds_only" | "decline" {
  if (bridge_count > 0) return "stitch";
  if (flows.some((flow) => flow.seeds.length >= 2)) return "stitch_seeds_only";
  return "decline";
}

interface HarvestManifest {
  schema_version: number;
  run_id: string;
  verdict: string;
  reason: string;
  graded_at: string;
  source_repo: string;
  harvested_at: string;
  detail: {
    kind: "stitch" | "stitch_seeds_only" | "decline";
    files: string[];
    expected_flow_count: number;
    expected_members: string[];
    expected_description_anchors: string[];
  };
}

function build_manifest(
  record: ReconcileRunRecord,
  verdict: string,
  reason: string,
  graded_at: string,
  source_repo: string,
  input: InspectInput,
): HarvestManifest {
  const summary = collect_store_summary(input);
  const run_flow_ids = new Set((record.detail.outcomes ?? []).map((outcome) => outcome.flow_id));
  const flows = summary.flows.filter((flow) => flow.live && run_flow_ids.has(flow.id));
  const scoped = flows.length > 0 ? flows : summary.flows.filter((flow) => flow.live);
  const members = [...new Set(scoped.flatMap((flow) => [...flow.members]))].sort();
  const bridge_count = scoped.reduce((total, flow) => total + flow.bridge_count, 0);
  const description_anchors = new Set<string>();
  for (const flow of scoped) {
    const detail = collect_flow_detail(input, flow.id);
    for (const member of detail?.member_descriptions ?? []) {
      if (member.source === "llm") description_anchors.add(member.symbol_path);
    }
  }
  return {
    schema_version: HARVEST_MANIFEST_SCHEMA_VERSION,
    run_id: record.run_id,
    verdict,
    reason,
    graded_at,
    source_repo,
    harvested_at: new Date().toISOString(),
    detail: {
      kind: derive_kind(scoped, bridge_count),
      files: [...(record.detail.file_set ?? [])],
      expected_flow_count: scoped.length,
      expected_members: members,
      expected_description_anchors: [...description_anchors].sort(),
    },
  };
}

function main(): void {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-harvest: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  const record = read_reconcile_record_by_run_id(args.store, args.run_id);
  if (record === null) {
    process.stderr.write(`drift-harvest: no reconcile run for "${args.run_id}"\n`);
    process.exit(1);
  }
  const grade = read_grades(args.store).get(args.run_id);
  if (grade === undefined) {
    process.stderr.write(`drift-harvest: run ${args.run_id} is ungraded — grade it first (drift-inspect --grade)\n`);
    process.exit(1);
  }
  if (grade.verdict !== "good") {
    process.stderr.write(
      `drift-harvest: run ${args.run_id} is graded "${grade.verdict}" — only good runs mint positive goldens\n`,
    );
    process.exit(1);
  }

  const slice_paths = [...new Set([...(record.detail.file_set ?? []), ...args.extra])];
  if (slice_paths.length === 0) {
    process.stderr.write(`drift-harvest: run ${args.run_id} has an empty file set — nothing to snapshot\n`);
    process.exit(1);
  }
  const sources = new Map<string, string>();
  let total_bytes = 0;
  for (const rel_path of slice_paths) {
    const abs = path.join(args.repo_root, rel_path);
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      process.stderr.write(`drift-harvest: cannot read ${abs} — pass reachable paths via --extra\n`);
      process.exit(1);
    }
    total_bytes += Buffer.byteLength(content);
    sources.set(rel_path, content);
  }
  if (total_bytes > MAX_FIXTURE_BYTES) {
    process.stderr.write(
      `drift-harvest: slice is ${total_bytes} bytes (cap ${MAX_FIXTURE_BYTES}) — embedded source is permanent git history; trim the slice\n`,
    );
    process.exit(1);
  }

  const source_repo = path.basename(args.repo_root);
  const manifest = build_manifest(record, grade.verdict, grade.reason, grade.graded_at, source_repo, read_inspect_input(args.store));

  const slug = args.slug ?? `${source_repo}_${record.run_id.slice(0, 16).toLowerCase()}`;
  const fixture_dir = path.join(args.out, slug);
  fs.rmSync(fixture_dir, { recursive: true, force: true });
  for (const [rel_path, content] of sources) {
    const target = path.join(fixture_dir, rel_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(path.join(fixture_dir, "fixture.json"), JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(
    `drift-harvest: wrote ${fixture_dir} (${sources.size} file(s), kind=${manifest.detail.kind}, from run ${record.run_id})\n`,
  );
}

main();
