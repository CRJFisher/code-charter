#!/usr/bin/env node

import { run_init } from "./init_command";

function print_usage(): void {
  console.log(`
Usage: code-charter <command> [options]

Commands:
  init [directory]   Initialize Code Charter for a project directory.
                     Scans source files, builds a call graph, clusters symbols,
                     and writes cluster-summaries.json + .code-charter/cache.json.

                     If no directory is given, the current working directory is used.

Options:
  --help, -h         Show this help message.
  --version, -v      Show version.
`);
}

function print_version(): void {
  console.log("code-charter v0.0.1");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    print_usage();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    print_version();
    process.exit(0);
  }

  const command = args[0];

  if (command === "init") {
    const target_dir = args[1] || process.cwd();
    await run_init(target_dir);
  } else {
    console.error(`Unknown command: ${command}`);
    print_usage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
