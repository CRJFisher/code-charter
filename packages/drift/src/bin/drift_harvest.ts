#!/usr/bin/env node
/**
 * The golden-case harvester: freeze a graded reconcile run into a stitch_eval fixture
 * (docs/contracts/harvested_fixture_manifest.md). It copies the run's changed file set (plus any
 * `--extra` paths the flow needs to resolve standalone) out of the source repo byte-exact, and
 * writes fixture.json with the expectation build_manifest derives from the store the graded run
 * produced, plus the provenance that makes a later regression traceable to the human judgement
 * that minted it.
 *
 * Only `good` runs whose outcomes touch live flows harvest: the expectation asserts "the agent
 * reproduces the human-blessed judgement", which is a valid positive golden only there —
 * ungraded, bad, mixed, retire-only, and no-op runs are refused with exit 1, never silently
 * widened. The fixture dir derives from the full run_id, so a re-harvest rewrites the same
 * fixture — idempotent by construction.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { read_grades } from "../reconcile/grade_log";
import { read_reconcile_record_by_run_id } from "../reconcile/reconcile_log";
import { build_manifest } from "../reconcile/harvest";
import { collect_flow_detail, collect_store_summary, type InspectInput } from "../inspect/summary";
import { read_inspect_input } from "../inspect/read_input";

const USAGE =
  "usage: drift-harvest --store <db_path> --repo-root <abs> --run <run_id> --out <fixtures_dir> [--slug <name>] [--extra <a,b,...>]";

/** Embedded source is permanent git history — keep harvested slices small and deliberate. */
const MAX_FIXTURE_BYTES = 128 * 1024;

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

function fail(message: string): never {
  process.stderr.write(`drift-harvest: ${message}\n`);
  process.exit(1);
}

/** Containment: a slice path must stay inside its root — `..` escapes are operator error. */
function resolve_within(root: string, rel_path: string, role: string): string {
  const resolved = path.resolve(root, rel_path);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    fail(`${role} path escapes its root: ${rel_path}`);
  }
  return resolved;
}

function main(): void {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-harvest: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  const record = read_reconcile_record_by_run_id(args.store, args.run_id);
  if (record === null) fail(`no reconcile run for "${args.run_id}"`);
  const grade = read_grades(args.store).get(args.run_id);
  if (grade === undefined) fail(`run ${args.run_id} is ungraded — grade it first (drift-inspect --grade)`);
  if (grade.verdict !== "good") {
    fail(`run ${args.run_id} is graded "${grade.verdict}" — only good runs mint positive goldens`);
  }

  const slice_paths = [...new Set([...(record.detail.file_set ?? []), ...args.extra])];
  if (slice_paths.length === 0) fail(`run ${args.run_id} has an empty file set — nothing to snapshot`);
  const repo_root = path.resolve(args.repo_root);
  const sources = new Map<string, Buffer>();
  let total_bytes = 0;
  for (const rel_path of slice_paths) {
    const abs = resolve_within(repo_root, rel_path, "slice");
    let content: Buffer;
    try {
      // Buffers keep the snapshot byte-exact — a utf8 round-trip would silently corrupt any
      // non-UTF-8 source and mis-size the cap.
      content = fs.readFileSync(abs);
    } catch {
      fail(`cannot read ${abs} — pass reachable repo-relative paths via --extra`);
    }
    total_bytes += content.length;
    sources.set(rel_path, content);
  }
  if (total_bytes > MAX_FIXTURE_BYTES) {
    fail(
      `slice is ${total_bytes} bytes (cap ${MAX_FIXTURE_BYTES}) — embedded source is permanent git history; trim the slice`,
    );
  }

  let input: InspectInput;
  try {
    input = read_inspect_input(args.store);
  } catch (error: unknown) {
    fail(`cannot read store ${args.store}: ${String(error)}`);
  }
  const source_repo = path.basename(repo_root);
  const manifest = build_manifest(
    record,
    grade,
    source_repo,
    new Date().toISOString(),
    collect_store_summary(input),
    (flow_id) => collect_flow_detail(input, flow_id),
  );
  if (manifest === null) {
    fail(`run ${args.run_id}'s outcomes name no live flow — a retire-only or no-op run has nothing to freeze`);
  }

  const slug = args.slug ?? `${source_repo}_${record.run_id.toLowerCase()}`;
  const out_root = path.resolve(args.out);
  const fixture_dir = resolve_within(out_root, slug, "slug");
  fs.rmSync(fixture_dir, { recursive: true, force: true });
  for (const [rel_path, content] of sources) {
    const target = resolve_within(fixture_dir, rel_path, "snapshot");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(path.join(fixture_dir, "fixture.json"), JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(
    `drift-harvest: wrote ${fixture_dir} (${sources.size} file(s), kind=${manifest.detail.kind}, from run ${record.run_id})\n`,
  );
}

main();
