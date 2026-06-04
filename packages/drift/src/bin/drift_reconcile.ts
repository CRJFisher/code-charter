#!/usr/bin/env node
/**
 * The `drift-reconcile` bin — the store-mutating reconcile engine the `drift-sync` skill shells into.
 * The skill script is dependency-free and cannot import `@code-charter/core`, so it spawns this built
 * bin with the same pinned contract (`--files/--store/--repo-root/--json/--dry-run`).
 *
 * It opens the graph store (degrading to a no-op `NullGraphStore` on a host without the SQLite engine),
 * builds the headless Ariadne call graph over the repo, runs {@link reconcile}, and emits one JSON
 * outcome record per flow. Exit 0 = success or no-op, 2 = usage error.
 */

import { open_graph_store } from "@code-charter/core";

import { make_ariadne_adapter } from "../reconcile/ariadne_adapter";
import { HeadlessProject } from "../reconcile/headless_project";
import { read_only_store } from "../reconcile/dry_run_store";
import { reconcile } from "../reconcile/reconcile";

const USAGE =
  "usage: drift-reconcile --files <a,b,...> --store <db_path> --repo-root <abs> [--goal <name>] [--json] [--dry-run]";

interface Args {
  files: string[];
  store: string;
  repo_root: string;
  json: boolean;
  dry_run: boolean;
  goal: string | undefined;
}

const VALUE_FLAGS: Record<string, "files_raw" | "store" | "repo_root" | "goal"> = {
  "--files": "files_raw",
  "--store": "store",
  "--repo-root": "repo_root",
  "--goal": "goal",
};

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: { files_raw?: string; store?: string; repo_root?: string; goal?: string; json: boolean; dry_run: boolean } = {
    json: false,
    dry_run: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const field = VALUE_FLAGS[token];
    if (field !== undefined) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `missing value for ${token}` };
      raw[field] = value;
      i++;
    } else if (token === "--json") {
      raw.json = true;
    } else if (token === "--dry-run") {
      raw.dry_run = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  if (raw.files_raw === undefined) return { error: "missing required --files" };
  if (raw.store === undefined) return { error: "missing required --store" };
  if (raw.repo_root === undefined) return { error: "missing required --repo-root" };
  const files = raw.files_raw.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  return { args: { files, store: raw.store, repo_root: raw.repo_root, json: raw.json, dry_run: raw.dry_run, goal: raw.goal } };
}

async function main(): Promise<void> {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-reconcile: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  if (args.files.length === 0) {
    if (args.json) process.stdout.write("[]\n");
    process.stderr.write("drift-reconcile: empty file set, no-op\n");
    return;
  }

  const store = open_graph_store(args.store);
  try {
    const project = new HeadlessProject(args.repo_root);
    await project.initialize();
    const log = (message: string) => process.stderr.write(`drift-reconcile: ${message}\n`);
    const adapter = make_ariadne_adapter(project, log);

    const result = await reconcile(args.files, {
      store: args.dry_run ? read_only_store(store) : store,
      adapter,
      repo_root_abs: args.repo_root,
      analyzed_root: "",
      goal: args.goal,
      now: () => new Date().toISOString(),
      log,
    });

    if (args.json) {
      process.stdout.write(JSON.stringify(result.outcomes) + "\n");
    } else {
      for (const outcome of result.outcomes) {
        process.stderr.write(
          `drift-reconcile: ${outcome.action} ${outcome.flow_id} (${outcome.kind}, ${outcome.member_count} members)\n`,
        );
      }
    }
    process.stderr.write(`drift-reconcile: reconciled ${result.outcomes.length} flow(s) over ${args.files.length} file(s)\n`);
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`drift-reconcile: fatal: ${String(error)}\n`);
  process.exit(1);
});
