/**
 * Skill-directory detection + ingestion — the v1 first-target path. A changed file whose directory (or
 * an ancestor up to the repo root) contains a `SKILL.md` belongs to a skill bundle; that bundle is the
 * flow boundary. The literal skill extractor (`ingest_skill`, task-21.2's port) writes the bundle's doc
 * nodes + `skill.to_*` edges into the raw tier, which the hydration engine groups into one flow.
 *
 * File IO is `node:fs` here (the bin runs headless); `ingest_skill` itself stays filesystem-agnostic via
 * the injected readers, exactly as it is unit-tested.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { GraphStore, SkillIngestResult } from "@code-charter/core";
import { ingest_skill } from "@code-charter/core";

const SKILL_FILE = "SKILL.md";

/** True when `p` exists and is a directory, never throwing (a stat race / EACCES / ELOOP yields false). */
function is_directory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The absolute path of the skill bundle a file belongs to, or undefined. Walks from the file's directory
 * up to (and including) the repo root, returning the nearest ancestor that holds a `SKILL.md`. Never
 * throws — it runs inside the never-throw `Stop` hook (flow-relevance pre-filter), so a filesystem error
 * degrades to "no skill root" rather than aborting the walk.
 */
export function find_skill_root(abs_file: string, repo_root_abs: string): string | undefined {
  let dir = is_directory(abs_file) ? abs_file : path.dirname(abs_file);
  const root = path.resolve(repo_root_abs);
  for (;;) {
    if (fs.existsSync(path.join(dir, SKILL_FILE))) return dir;
    if (path.resolve(dir) === root) return undefined;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** List a skill bundle's files as paths relative to the skill dir (posix), recursing into subdirs. */
function list_bundle_files(skill_dir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(rel);
    }
  };
  walk(skill_dir, "");
  return out;
}

/** Ingest one skill bundle into the raw tier with `node:fs`-backed readers. */
export function ingest_skill_dir(store: GraphStore, skill_dir_abs: string): SkillIngestResult {
  return ingest_skill(store, skill_dir_abs, {
    read_file: (p) => fs.readFileSync(p, "utf-8"),
    list_files: (dir) => list_bundle_files(dir),
  });
}
