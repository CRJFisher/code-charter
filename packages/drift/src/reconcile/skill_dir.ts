/**
 * Skill-directory detection and ingestion. A changed file whose directory (or an ancestor up to the repo
 * root) contains a `SKILL.md` belongs to a skill bundle, and that bundle is the flow boundary.
 * `ingest_skill` writes the bundle's doc nodes and `skill.to_*` edges into the raw tier, which the
 * hydration engine groups into one flow.
 *
 * File IO uses `node:fs` here because the bin runs headless; `ingest_skill` stays filesystem-agnostic via
 * injected readers so it can be unit-tested without disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { GraphStore, SkillIngestResult } from "@code-charter/core";
import { ingest_skill, read_sub_agents } from "@code-charter/core";

export const SKILL_FILE = "SKILL.md";
const META_FILE = "meta.json";

/** A link target that points outside the bundle (absolute, home-relative, or a URL scheme) — never a bundle file. */
const EXTERNAL = /^(~|\/|[a-z][a-z0-9+.-]*:)/i;

/** Whether `p` is an existing directory, swallowing stat errors (race / EACCES / ELOOP) as `false`. */
function is_directory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The absolute path of the skill bundle a file belongs to, or undefined: the nearest ancestor (from the
 * file's directory up to and including the repo root) that holds a `SKILL.md`. Never throws — it runs
 * inside the never-throw `Stop` hook, so a filesystem error degrades to "no skill root" rather than
 * aborting the walk.
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

/**
 * Screen a skill bundle on disk for the partial/degraded-write signals that must DEFER this turn's
 * overwrite — the skill-path counterpart to the code path's trustworthy-graph gate. Returns a reason
 * string when the bundle is untrustworthy, or undefined when it is safe to ingest:
 *
 *  - SKILL.md is unreadable, or empty/whitespace-only — a mid-edit truncation that would overwrite a
 *    rich flow with a one-node husk.
 *  - `meta.json` is present but unparseable — a mid-edit truncation. Ingesting it would silently drop
 *    every sub-agent bridge (`read_sub_agents` returns `[]` on a parse error), overwriting the good
 *    flow with a bridge-less snapshot while SKILL.md still looks intact.
 *  - a `meta.json` sub-agent declaration names an in-bundle `file` that is absent from disk — a
 *    transiently missing sub-agent file, i.e. a partial bundle. A declaration pointing OUTSIDE the
 *    bundle (external path, or a `..`-escape) is one `ingest_skill` ignores by design, never a
 *    partial-write, so its absence is not a defect.
 *
 * A SKILL.md that still parses but lost some links is indistinguishable from a genuine edit and is
 * NOT a defect — identical stance to the code path, which retires a partially-broken-but-parseable
 * seed file rather than deferring forever.
 */
export function assess_skill_bundle(skill_dir_abs: string): string | undefined {
  let skill_source: string;
  try {
    skill_source = fs.readFileSync(path.join(skill_dir_abs, SKILL_FILE), "utf-8");
  } catch {
    return "SKILL.md unreadable";
  }
  if (skill_source.trim().length === 0) return "SKILL.md is empty (mid-edit truncation)";

  let meta_source: string;
  try {
    meta_source = fs.readFileSync(path.join(skill_dir_abs, META_FILE), "utf-8");
  } catch {
    return undefined; // no meta.json → no sub-agent declarations to verify
  }
  try {
    JSON.parse(meta_source);
  } catch {
    return "meta.json is unparseable (mid-edit truncation)";
  }

  const bundle_files = new Set(list_bundle_files(skill_dir_abs));
  for (const decl of read_sub_agents(meta_source)) {
    const rel = decl.file === null ? null : bundle_relative(decl.file);
    if (rel === null) continue; // absent decl / external / bundle-escaping — ingest ignores it too
    if (!bundle_files.has(rel)) return `declared sub-agent file missing from bundle: ${decl.file}`;
  }
  return undefined;
}

/**
 * Resolve a `meta.json` sub-agent `file` to its bundle-relative posix path, or null when it points
 * outside the bundle. Mirrors `ingest_skill`'s resolver for a link written in `meta.json` (which sits
 * at the bundle root), so the guard flags exactly the declarations ingest would try to resolve.
 */
function bundle_relative(file: string): string | null {
  if (EXTERNAL.test(file)) return null;
  const out: string[] = [];
  for (const segment of file.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null; // escapes the bundle root
      out.pop();
    } else {
      out.push(segment);
    }
  }
  // Mirror ingest_skill's resolve exactly: an empty result, or one that still escapes the root (a
  // segment literally beginning with `..`), is not an in-bundle path.
  const resolved = out.join("/");
  return resolved === "" || resolved.startsWith("..") ? null : resolved;
}
