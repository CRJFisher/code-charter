import * as vscode from "vscode";
import { Project } from "@ariadnejs/core";
import type { CallGraph, FilePath } from "@ariadnejs/types";
import * as fs from "fs";
import * as path from "path";

export class AriadneProjectManager {
  private project: Project | undefined;
  private workspace_path: string;
  private file_watcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];
  private file_filter: (path: string) => boolean;
  private on_call_graph_changed_emitter = new vscode.EventEmitter<CallGraph>();

  public readonly on_call_graph_changed = this.on_call_graph_changed_emitter.event;

  constructor(
    workspace_path: string,
    file_filter: (path: string) => boolean = () => true
  ) {
    this.workspace_path = workspace_path;
    this.file_filter = file_filter;
  }

  /**
   * Feed Ariadne repo-relative, forward-slash paths so the call graph's `symbol_path`s live in the same
   * portable space the persisted store + the drift reconcile engine use. Without this, a hydrated flow's
   * repo-relative ids never match this host's absolute-keyed graph and the flow renders empty.
   */
  private to_repo_relative(abs_path: string): string {
    return path.relative(this.workspace_path, abs_path).split(path.sep).join("/");
  }

  private static readonly EXCLUDED_DIRS = new Set([
    "node_modules", "__pycache__", ".vscode", "out", ".git", ".hg",
    "dist", "build", ".tox", ".mypy_cache", ".pytest_cache",
    "venv", ".venv", "env", ".env",
  ]);

  private static readonly SUPPORTED_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".py", ".rs",
  ]);

  // True when any segment of a repo-relative path names an excluded directory. `scan_files` skips
  // these during recursion; the watcher applies this check explicitly so an excluded-dir file (e.g. a
  // `node_modules` write) is ignored regardless of the instance `file_filter`.
  private static is_in_excluded_dir(repo_relative_path: string): boolean {
    return repo_relative_path.split("/").some((segment) => AriadneProjectManager.EXCLUDED_DIRS.has(segment));
  }

  private static is_supported(file_path: string): boolean {
    const ext = path.extname(file_path).toLowerCase();
    return AriadneProjectManager.SUPPORTED_EXTENSIONS.has(ext);
  }

  // Strings ariadne emits via console.warn for non-actionable parse-time gaps.
  // We suppress them during indexing because they fire once per affected
  // definition and would otherwise drown the dev console for any non-trivial
  // workspace.
  private static readonly ARIADNE_WARN_PREFIXES = [
    "Could not find body scope for",
    "Could not find colon in class definition",
    "Circular inheritance detected",
  ];

  private static async with_quiet_ariadne_warnings<T>(fn: () => T | Promise<T>): Promise<T> {
    const original_warn = console.warn;
    console.warn = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" &&
          AriadneProjectManager.ARIADNE_WARN_PREFIXES.some(p => first.startsWith(p))) {
        return;
      }
      original_warn.apply(console, args);
    };
    try {
      return await fn();
    } finally {
      console.warn = original_warn;
    }
  }

  /**
   * Initialize the project by loading all files and setting up watchers
   */
  async initialize(): Promise<CallGraph> {
    this.project = new Project();
    await this.project.initialize(this.workspace_path as FilePath);

    const files = await this.scan_files(this.workspace_path);
    let indexed = 0;
    let skipped = 0;
    const project = this.project;
    await AriadneProjectManager.with_quiet_ariadne_warnings(async () => {
      for (const file_path of files) {
        try {
          const content = await fs.promises.readFile(file_path, "utf-8");
          project.update_file(this.to_repo_relative(file_path) as FilePath, content);
          indexed++;
        } catch {
          // Parse failures are non-fatal — the file is omitted from the graph.
          skipped++;
        }
      }
    });
    console.log(`AriadneProjectManager: indexed ${indexed} files, skipped ${skipped}`);

    this.setup_file_watchers();

    return this.project.get_call_graph();
  }

  /**
   * Recursively scan directory for files matching the filter
   */
  private async scan_files(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const full_path = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!AriadneProjectManager.EXCLUDED_DIRS.has(entry.name)) {
          results.push(...await this.scan_files(full_path));
        }
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (!AriadneProjectManager.is_supported(full_path)) {
          continue;
        }
        try {
          if (this.file_filter(full_path)) {
            results.push(full_path);
          }
        } catch (error) {
          console.error(`Filter error for ${full_path}:`, error);
        }
      }
    }
    return results;
  }

  /**
   * Update a file in the project
   */
  private async update_file_in_project(file_path: string): Promise<void> {
    if (!this.project) {
      return;
    }
    const project = this.project;
    try {
      const content = await fs.promises.readFile(file_path, "utf-8");
      AriadneProjectManager.with_quiet_ariadne_warnings(() => {
        project.update_file(this.to_repo_relative(file_path) as FilePath, content);
      });
    } catch {
      // Parse failures are non-fatal; the file is omitted from the call graph.
    }
  }

  /**
   * Set up file system watchers for incremental updates
   */
  private setup_file_watchers(): void {
    // Create a file watcher for the workspace
    const pattern = new vscode.RelativePattern(this.workspace_path, "**/*");
    this.file_watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const passes_filters = (file_path: string): boolean => {
      return (
        AriadneProjectManager.is_supported(file_path) &&
        !AriadneProjectManager.is_in_excluded_dir(this.to_repo_relative(file_path)) &&
        this.file_filter(file_path)
      );
    };

    this.disposables.push(
      this.file_watcher.onDidCreate(async (uri) => {
        if (passes_filters(uri.fsPath)) {
          await this.update_file_in_project(uri.fsPath);
          this.emit_call_graph_changed();
        }
      })
    );

    this.disposables.push(
      this.file_watcher.onDidChange(async (uri) => {
        if (passes_filters(uri.fsPath)) {
          await this.update_file_in_project(uri.fsPath);
          this.emit_call_graph_changed();
        }
      })
    );

    this.disposables.push(
      this.file_watcher.onDidDelete((uri) => {
        if (passes_filters(uri.fsPath) && this.project) {
          this.project.remove_file(this.to_repo_relative(uri.fsPath) as FilePath);
          this.emit_call_graph_changed();
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const document = event.document;
        if (document.uri.scheme === "file" && document.uri.fsPath.startsWith(this.workspace_path)) {
          try {
            if (passes_filters(document.uri.fsPath)) {
              this.handle_document_change(document);
            }
          } catch (error) {
            console.error(`Filter error for ${document.uri.fsPath}:`, error);
          }
        }
      })
    );
  }

  /**
   * Handle incremental document changes
   */
  private handle_document_change(document: vscode.TextDocument): void {
    if (!this.project) {
      return;
    }
    const project = this.project;
    AriadneProjectManager.with_quiet_ariadne_warnings(() => {
      project.update_file(this.to_repo_relative(document.uri.fsPath) as FilePath, document.getText());
    });
    this.debounce_call_graph_update();
  }

  private update_timer: NodeJS.Timeout | undefined;

  /**
   * Debounce call graph updates to avoid excessive recalculation
   */
  private debounce_call_graph_update(): void {
    if (this.update_timer) {
      clearTimeout(this.update_timer);
    }

    this.update_timer = setTimeout(() => {
      this.emit_call_graph_changed();
    }, 500); // Wait 500ms after last change
  }

  /**
   * Emit that the call graph has changed
   */
  private emit_call_graph_changed(): void {
    if (!this.project) {
      return;
    }
    const call_graph = this.project.get_call_graph();
    this.on_call_graph_changed_emitter.fire(call_graph);
  }

  get_call_graph(): CallGraph {
    if (!this.project) {
      return { nodes: new Map(), entry_points: [] };
    }
    return this.project.get_call_graph();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.file_watcher?.dispose();
    this.on_call_graph_changed_emitter.dispose();
    if (this.update_timer) {
      clearTimeout(this.update_timer);
    }
  }
}
