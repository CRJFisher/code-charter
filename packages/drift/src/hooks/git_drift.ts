/**
 * Out-of-session drift detection for the read-only `SessionStart` banner. The transcript belongs
 * to a prior session, so outstanding drift is read from the working tree via `git status`. The
 * git invocation is injected so the parser and the decision are unit-testable without a real
 * repo; a missing or failing git degrades to an empty list (the no-git file-hashing fallback is
 * out of v1 scope). Diffing against a last-reconciled watermark lands in task-27.1.6.
 */

import { execFileSync } from "node:child_process";

/** Runs a git subcommand in `cwd` and returns stdout. */
export type RunGit = (args: readonly string[], cwd: string) => string;

export const default_run_git: RunGit = (args, cwd) =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" });

/** Parse `git status --porcelain` output into the changed file paths (handles renames). */
export function parse_porcelain(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split("\n")) {
    if (line.length < 4) {
      continue;
    }
    const rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    files.push(arrow === -1 ? rest : rest.slice(arrow + 4));
  }
  return files;
}

/** The files with outstanding (uncommitted) changes — the v1 outstanding-drift signal. */
export function list_outstanding_drift(cwd: string, run_git: RunGit = default_run_git): string[] {
  let output: string;
  try {
    output = run_git(["status", "--porcelain"], cwd);
  } catch {
    return [];
  }
  return parse_porcelain(output);
}
