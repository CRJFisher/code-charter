#!/usr/bin/env node
"use strict";

// drift-sync bundled script — STUB (task-27.1.1).
//
// Parses the pinned contract, logs the hydrate-vs-resync dispatch decision per affected flow,
// and performs NO store mutation. The real body (re-extract -> re-induce -> preserve -> write)
// lands in task-27.1.6. This file is intentionally dependency-free: it runs from an installed
// `.claude` directory where no node_modules is guaranteed. task-27.1.6 gives it store access by
// shelling into the built drift/core package, not by importing core from here.

const USAGE =
  "usage: drift_sync.js --files <a,b,...> --store <db_path> --repo-root <abs> [--json] [--dry-run]";

function parse_args(argv) {
  const args = { files: null, store: null, repo_root: null, json: false, dry_run: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--files") {
      args.files = argv[++i];
    } else if (token === "--store") {
      args.store = argv[++i];
    } else if (token === "--repo-root") {
      args.repo_root = argv[++i];
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "--dry-run") {
      args.dry_run = true;
    } else {
      return { error: `unknown argument: ${token}` };
    }
  }
  if (args.files === null) {
    return { error: "missing required --files" };
  }
  if (args.store === null) {
    return { error: "missing required --store" };
  }
  if (args.repo_root === null) {
    return { error: "missing required --repo-root" };
  }
  return { args };
}

function split_files(files_value) {
  return files_value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Placeholder flow resolution. task-27.1.6 replaces this with real flow lookup (subgraph
// induction from the changed file's seeds).
function flow_key_for(file_path) {
  return `flow:${file_path}`;
}

// Placeholder dispatch. task-27.1.6 replaces this body with a store query — hydrate when
// EXISTS(agentic.flow node) is false, else resync — plus the actual re-extract / re-induce /
// preserve / write. The stub always reports "hydrate" and mutates nothing.
function dispatch_flow(file_path /* , store_path, repo_root */) {
  return { file: file_path, flow_key: flow_key_for(file_path), decision: "hydrate", mutated: false };
}

function main() {
  const parsed = parse_args(process.argv.slice(2));
  if (parsed.error) {
    process.stderr.write(`drift-sync: ${parsed.error}\n${USAGE}\n`);
    process.exit(2);
  }
  const { args } = parsed;
  const files = split_files(args.files);
  const records = files.map((file_path) => dispatch_flow(file_path, args.store, args.repo_root));

  if (args.json) {
    process.stdout.write(JSON.stringify(records) + "\n");
  } else {
    for (const record of records) {
      process.stderr.write(
        `drift-sync: ${record.decision} ${record.flow_key} (${record.file}) [no mutation]\n`,
      );
    }
  }
  process.stderr.write(
    `drift-sync: stub, no store mutation performed for ${files.length} file(s) ` +
      "(body lands in task-27.1.6)\n",
  );
  process.exit(0);
}

main();
