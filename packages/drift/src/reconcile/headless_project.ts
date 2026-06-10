/**
 * A headless `@ariadnejs/core` `Project` wrapper — the host-free counterpart of the VSCode extension's
 * `AriadneProjectManager`. The reconcile bin runs outside any editor (it is launched by the `drift-sync`
 * skill from a `Stop` hook), so it builds and queries the call graph directly over the filesystem with
 * `node:fs`, no `vscode` API, no file watchers, no debounce.
 *
 * It owns exactly what the reconcile engine needs: build the project over a repo root, hand back the
 * `CallGraph`, expose each file's `SemanticIndex` + source for the resolver/raw-extraction walk, and
 * re-index a changed file set on demand (the RE-SYNC path).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { Project } from "@ariadnejs/core";
import type { CallGraph, FilePath } from "@ariadnejs/types";

import { to_repo_relative } from "./paths";

/** Ariadne's per-file semantic index — derived from the `Project` method since it is not re-exported by name. */
export type SemanticIndex = NonNullable<ReturnType<Project["get_index_single_file"]>>;

const EXCLUDED_DIRS = new Set([
  "node_modules", "__pycache__", ".vscode", "out", ".git", ".hg",
  "dist", "build", ".tox", ".mypy_cache", ".pytest_cache",
  "venv", ".venv", "env", ".env",
]);

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rs"]);

/** True for a path Ariadne can parse into the call graph. */
export function is_supported_source(file_path: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(file_path).toLowerCase());
}

// Ariadne emits these via console.warn once per affected definition; they are non-actionable parse-time
// gaps that would otherwise drown the hook's stderr on any non-trivial repo.
const ARIADNE_WARN_PREFIXES = [
  "Could not find body scope for",
  "Could not find colon in class definition",
  "Circular inheritance detected",
];

async function with_quiet_ariadne_warnings<T>(fn: () => T | Promise<T>): Promise<T> {
  const original_warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && ARIADNE_WARN_PREFIXES.some((p) => first.startsWith(p))) return;
    original_warn.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.warn = original_warn;
  }
}

export class HeadlessProject {
  private project: Project | undefined;
  /** Repo-relative path → file source, cached at index time so the raw walk re-slices without re-reading. */
  private readonly sources = new Map<string, string>();
  /** Repo-relative paths whose read or index failed — present on disk but absent from the graph. */
  private readonly omitted = new Set<string>();

  constructor(private readonly repo_root_abs: string) {}

  /**
   * Index every supported file under the repo root and build the call graph once. Files are fed to
   * Ariadne by their REPO-RELATIVE path, so `CallableNode.location.file_path`, the resolver's
   * `symbol_path`, and the store's `path` all live in one portable, machine-independent space — the flow
   * layer (location-based ids) and the raw/resolver layer (rename-stable ids) then join.
   */
  async initialize(): Promise<void> {
    const project = new Project();
    await project.initialize(this.repo_root_abs as FilePath);
    const files = this.scan_files(this.repo_root_abs);
    await with_quiet_ariadne_warnings(() => {
      for (const abs of files) {
        const rel = to_repo_relative(abs, this.repo_root_abs);
        try {
          const content = fs.readFileSync(abs, "utf-8");
          project.update_file(rel as FilePath, content);
          this.sources.set(rel, content);
        } catch {
          // A file that fails to read/index is omitted from the graph rather than aborting the run.
          // The omission is recorded so retirement decisions never trust a graph missing the file.
          this.omitted.add(rel);
        }
      }
    });
    this.project = project;
  }

  get_call_graph(): CallGraph {
    return this.project?.get_call_graph() ?? { nodes: new Map(), entry_points: [] };
  }

  /** Repo-relative files present on disk but omitted from the graph by a read/index failure. */
  omitted_files(): ReadonlySet<string> {
    return this.omitted;
  }

  /** The semantic index for a repo-relative path. */
  get_index_single_file(rel: string): SemanticIndex | undefined {
    return this.project?.get_index_single_file(rel as FilePath);
  }

  /** The cached source for an indexed (repo-relative) file, or undefined when it was never read. */
  get_source(rel: string): string | undefined {
    return this.sources.get(rel);
  }

  private scan_files(dir: string): string[] {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const full_path = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) results.push(...this.scan_files(full_path));
      } else if ((entry.isFile() || entry.isSymbolicLink()) && is_supported_source(full_path)) {
        results.push(full_path);
      }
    }
    return results;
  }
}
