/**
 * Path-space normalization for the reconcile bin. The `Stop`-hook transcript yields ABSOLUTE file paths,
 * but the store, the resolver, every `symbol_path`, and `analyzed_root` all work in repo-relative
 * forward-slash paths. Ariadne, in turn, is driven in absolute paths. This module owns the one
 * conversion both sides go through, so the two id spaces never silently mis-join.
 */

import * as path from "node:path";

/** Absolute (or repo-relative) path → repo-relative, forward-slash. */
export function to_repo_relative(file_path: string, repo_root_abs: string): string {
  const abs = path.isAbsolute(file_path) ? file_path : path.join(repo_root_abs, file_path);
  return path.relative(repo_root_abs, abs).split(path.sep).join("/");
}

/** Repo-relative path → absolute, native-separator (the form Ariadne's `Project` is keyed on). */
export function to_abs(repo_relative: string, repo_root_abs: string): string {
  return path.resolve(repo_root_abs, repo_relative);
}
