#!/usr/bin/env node
/**
 * The `drift-reconcile` bin — the store-mutating reconcile engine the `drift-sync` skill shells into.
 * The skill script is dependency-free and cannot import `@code-charter/core`, so it spawns this built
 * bin with a pinned contract.
 *
 * One headless default mode plus the three agentic modes the drift-sync skill orchestrates,
 * dispatched by flag (at most one):
 *  - default — the deterministic reconcile: resync/retire/skill-dir plus one-singleton-flow-per-new-
 *    entrypoint hydration. The complete path for hosts without an agent.
 *  - `--list-entrypoints` — runs the same deterministic reconcile, then emits the changed
 *    neighbourhood's entrypoint inventory as JSON on stdout (the agent's phase-1 input).
 *  - `--apply-stitch <json>` — hydrates agent-judged umbrellas as multi-seed flows with
 *    `agentic.bridge` edges, retires absorbed singletons, and returns the flow shape as JSON.
 *  - `--apply-descriptions <json>` — persists agent-authored member descriptions through the scoped
 *    write path, honoring the content-hash description cache.
 *
 * It opens the graph store (degrading to a no-op `NullGraphStore` on a host without the SQLite engine)
 * and builds the headless Ariadne call graph over the repo. Exit 0 = success or no-op, 2 = usage or
 * wire-contract error, 1 = fatal. Mode JSON goes to stdout; diagnostics go to stderr with the
 * `drift-reconcile:` prefix.
 */

import * as fs from "node:fs";

import { open_graph_store } from "@code-charter/core";

import {
  apply_descriptions,
  apply_stitch,
  build_entrypoint_inventory,
  parse_apply_descriptions,
  parse_apply_stitch,
} from "../reconcile/agentic_modes";
import { make_ariadne_adapter } from "../reconcile/ariadne_adapter";
import { HeadlessProject } from "../reconcile/headless_project";
import { read_only_store } from "../reconcile/dry_run_store";
import { reconcile } from "../reconcile/reconcile";
import { to_repo_relative } from "../reconcile/paths";
import type { ReconcileDeps, ReconcileResult } from "../reconcile/types";

const USAGE = [
  "usage: drift-reconcile --files <a,b,...> --store <db_path> --repo-root <abs> [--goal <name>] [--json] [--dry-run]",
  "       drift-reconcile --list-entrypoints --files <a,b,...> --store <db_path> --repo-root <abs> [--goal <name>] [--dry-run]",
  "       drift-reconcile --apply-stitch <json_path> --store <db_path> --repo-root <abs> [--dry-run]",
  "       drift-reconcile --apply-descriptions <json_path> --store <db_path> --repo-root <abs> [--dry-run]",
].join("\n");

type Mode = "default" | "list_entrypoints" | "apply_stitch" | "apply_descriptions";

interface Args {
  mode: Mode;
  files: string[];
  store: string;
  repo_root: string;
  json: boolean;
  dry_run: boolean;
  goal: string | undefined;
  /** The wire-JSON path for the apply modes. */
  payload_path: string | undefined;
}

const VALUE_FLAGS: Record<string, "files_raw" | "store" | "repo_root" | "goal" | "apply_stitch" | "apply_descriptions"> = {
  "--files": "files_raw",
  "--store": "store",
  "--repo-root": "repo_root",
  "--goal": "goal",
  "--apply-stitch": "apply_stitch",
  "--apply-descriptions": "apply_descriptions",
};

function parse_args(argv: readonly string[]): { args: Args } | { error: string } {
  const raw: {
    files_raw?: string;
    store?: string;
    repo_root?: string;
    goal?: string;
    apply_stitch?: string;
    apply_descriptions?: string;
    list_entrypoints: boolean;
    json: boolean;
    dry_run: boolean;
  } = { list_entrypoints: false, json: false, dry_run: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const field = VALUE_FLAGS[token];
    if (field !== undefined) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { error: `missing value for ${token}` };
      raw[field] = value;
      i++;
    } else if (token === "--list-entrypoints") {
      raw.list_entrypoints = true;
    } else if (token === "--json") {
      raw.json = true;
    } else if (token === "--dry-run") {
      raw.dry_run = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  const mode_flags = [raw.list_entrypoints, raw.apply_stitch !== undefined, raw.apply_descriptions !== undefined];
  if (mode_flags.filter(Boolean).length > 1) return { error: "at most one mode flag is allowed" };
  const mode: Mode = raw.list_entrypoints
    ? "list_entrypoints"
    : raw.apply_stitch !== undefined
      ? "apply_stitch"
      : raw.apply_descriptions !== undefined
        ? "apply_descriptions"
        : "default";

  if (raw.store === undefined) return { error: "missing required --store" };
  if (raw.repo_root === undefined) return { error: "missing required --repo-root" };
  const needs_files = mode === "default" || mode === "list_entrypoints";
  if (needs_files && raw.files_raw === undefined) return { error: "missing required --files" };
  const files = (raw.files_raw ?? "").split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  return {
    args: {
      mode,
      files,
      store: raw.store,
      repo_root: raw.repo_root,
      json: raw.json,
      dry_run: raw.dry_run,
      goal: raw.goal,
      payload_path: raw.apply_stitch ?? raw.apply_descriptions,
    },
  };
}

/** Read and JSON-parse a mode payload file; a contract breach exits 2. */
function read_payload(payload_path: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(payload_path, "utf8");
  } catch (error: unknown) {
    process.stderr.write(`drift-reconcile: cannot read ${payload_path}: ${String(error)}\n`);
    process.exit(2);
  }
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    process.stderr.write(`drift-reconcile: invalid JSON in ${payload_path}: ${String(error)}\n`);
    process.exit(2);
  }
}

function report_outcomes(result: ReconcileResult, file_count: number): void {
  for (const outcome of result.outcomes) {
    process.stderr.write(
      `drift-reconcile: ${outcome.action} ${outcome.flow_id} (${outcome.kind}, ${outcome.member_count} members)\n`,
    );
  }
  const retired = result.outcomes.filter((outcome) => outcome.action === "retire").length;
  const retired_note = retired > 0 ? ` (${retired} retired)` : "";
  const deferred_note =
    result.deferred_retirements.length > 0 ? `; deferred ${result.deferred_retirements.length} retirement(s)` : "";
  process.stderr.write(
    `drift-reconcile: reconciled ${result.outcomes.length} flow(s)${retired_note} over ${file_count} file(s)${deferred_note}\n`,
  );
}

async function main(): Promise<void> {
  const parsed = parse_args(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`drift-reconcile: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;

  if ((args.mode === "default" || args.mode === "list_entrypoints") && args.files.length === 0) {
    if (args.mode === "list_entrypoints") process.stdout.write(JSON.stringify({ entrypoints: [] }) + "\n");
    else if (args.json) process.stdout.write("[]\n");
    process.stderr.write("drift-reconcile: empty file set, no-op\n");
    return;
  }

  const store = open_graph_store(args.store);
  try {
    const project = new HeadlessProject(args.repo_root);
    await project.initialize();
    const log = (message: string) => process.stderr.write(`drift-reconcile: ${message}\n`);
    const adapter = make_ariadne_adapter(project, log);

    const deps: ReconcileDeps = {
      store: args.dry_run ? read_only_store(store) : store,
      adapter,
      repo_root_abs: args.repo_root,
      analyzed_root: "",
      goal: args.goal,
      now: () => new Date().toISOString(),
      log,
    };

    switch (args.mode) {
      case "default": {
        const result = await reconcile(args.files, deps);
        if (args.json) process.stdout.write(JSON.stringify(result.outcomes) + "\n");
        report_outcomes(result, args.files.length);
        return;
      }
      case "list_entrypoints": {
        // The same deterministic reconcile as the default mode — resync, retire, and singleton
        // hydration all ride this pass — followed by the inventory read the agent judges from.
        const result = await reconcile(args.files, deps);
        report_outcomes(result, args.files.length);
        const changed = args.files.map((f) => to_repo_relative(f, args.repo_root));
        const inventory = build_entrypoint_inventory(deps, changed, adapter.call_graph());
        process.stdout.write(JSON.stringify(inventory) + "\n");
        return;
      }
      case "apply_stitch": {
        const parsed_payload = parse_apply_stitch(read_payload(args.payload_path!));
        if ("error" in parsed_payload) {
          process.stderr.write(`drift-reconcile: invalid --apply-stitch payload: ${parsed_payload.error}\n`);
          process.exit(2);
        }
        const result = await apply_stitch(deps, parsed_payload.input, adapter.call_graph());
        process.stdout.write(JSON.stringify(result) + "\n");
        process.stderr.write(
          `drift-reconcile: applied ${result.flows.length} umbrella(s) from ${parsed_payload.input.umbrellas.length} proposed\n`,
        );
        return;
      }
      case "apply_descriptions": {
        const parsed_payload = parse_apply_descriptions(read_payload(args.payload_path!));
        if ("error" in parsed_payload) {
          process.stderr.write(`drift-reconcile: invalid --apply-descriptions payload: ${parsed_payload.error}\n`);
          process.exit(2);
        }
        const result = apply_descriptions(deps, parsed_payload.input, adapter.call_graph());
        process.stdout.write(JSON.stringify(result) + "\n");
        process.stderr.write(
          `drift-reconcile: wrote ${result.written.length} description(s), skipped ${result.skipped.length}\n`,
        );
        return;
      }
    }
  } finally {
    store.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`drift-reconcile: fatal: ${String(error)}\n`);
  process.exit(1);
});
