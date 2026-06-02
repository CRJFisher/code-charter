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

/** A porcelain v1 line is `XY <path>` — two status chars plus one space before the path. */
const PORCELAIN_PREFIX_LENGTH = 3;
/** Renames/copies render as `<from> -> <to>` in the path field. */
const RENAME_SEPARATOR = " -> ";
/** `git status --porcelain` with quoting disabled so paths come through verbatim (no C-escapes). */
const STATUS_ARGS: readonly string[] = ["-c", "core.quotePath=false", "status", "--porcelain"];

/** Parse `git status --porcelain` output into the changed file paths (takes the rename target). */
export function parse_porcelain(output: string): string[] {
  const files: string[] = [];
  for (const line of output.split("\n")) {
    if (line.length <= PORCELAIN_PREFIX_LENGTH) {
      continue;
    }
    const status_code = line.slice(0, 2);
    const path_field = line.slice(PORCELAIN_PREFIX_LENGTH);
    // Only rename/copy entries (R/C) use ` -> `; on any other status the substring would be a
    // literal part of the filename and must not be split.
    const is_rename = status_code.startsWith("R") || status_code.startsWith("C");
    const arrow = is_rename ? path_field.indexOf(RENAME_SEPARATOR) : -1;
    files.push(arrow === -1 ? path_field : path_field.slice(arrow + RENAME_SEPARATOR.length));
  }
  return files;
}

/** The files with outstanding (uncommitted) changes — the v1 outstanding-drift signal. */
export function list_outstanding_drift(cwd: string, run_git: RunGit = default_run_git): string[] {
  let output: string;
  try {
    output = run_git(STATUS_ARGS, cwd);
  } catch {
    return [];
  }
  return parse_porcelain(output);
}
