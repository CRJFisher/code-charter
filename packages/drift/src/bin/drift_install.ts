#!/usr/bin/env node
/**
 * The installer entry. Installs the drift substrate into the current working directory for the
 * Claude-Code host. v1 ships only the Claude-Code target; selecting another host is a future
 * layout lookup, not a code change here.
 */

import { HOST_LAYOUTS } from "../installer/host_layout";
import { install_drift, resolve_package_root } from "../installer/install";

function main(): void {
  const target_root = process.cwd();
  install_drift(target_root, HOST_LAYOUTS.claude_code, resolve_package_root());
  process.stdout.write(`drift: installed Claude-Code substrate into ${target_root}\n`);
}

main();
