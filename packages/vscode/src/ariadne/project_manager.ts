import * as vscode from "vscode";
import { load_project, Project } from "@ariadnejs/core";
import type { CallGraph, FilePath } from "@ariadnejs/types";
import * as fs from "fs";

export class AriadneProjectManager {
  private project: Project | undefined;
  private workspace_path: string;
  private file_watcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];
  private file_filter: (path: string) => boolean;
  private on_call_graph_changed_emitter = new vscode.EventEmitter<CallGraph>();

  // Public event that fires when the call graph changes
  public readonly onCallGraphChanged = this.on_call_graph_changed_emitter.event;

  constructor(
    workspace_path: string,
    file_filter: (path: string) => boolean = () => true
  ) {
    this.workspace_path = workspace_path;
    this.file_filter = file_filter;
  }

  /**
   * Initialize the project by loading all files and setting up watchers
   */
  async initialize(): Promise<CallGraph> {
    console.log("Initializing AriadneProjectManager...");

    this.project = await load_project({
      project_path: this.workspace_path,
      file_filter: this.file_filter,
      exclude: ["__pycache__", ".vscode", "out"],
    });

    // Set up file watchers
    this.setup_file_watchers();

    // Return initial call graph
    return this.project.get_call_graph();
  }

  /**
   * Update a file in the project
   */
  private async update_file_in_project(file_path: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(file_path, "utf-8");
      this.project!.update_file(file_path as FilePath, content);
      console.log(`Updated file in project: ${file_path}`);
    } catch (error) {
      console.error(`Error updating file ${file_path}:`, error);
    }
  }

  /**
   * Set up file system watchers for incremental updates
   */
  private setup_file_watchers(): void {
    // Create a file watcher for the workspace
    const pattern = new vscode.RelativePattern(this.workspace_path, "**/*");
    this.file_watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Handle file creation
    this.disposables.push(
      this.file_watcher.onDidCreate(async (uri) => {
        if (this.file_filter(uri.fsPath)) {
          await this.update_file_in_project(uri.fsPath);
          this.emit_call_graph_changed();
        }
      })
    );

    // Handle file changes
    this.disposables.push(
      this.file_watcher.onDidChange(async (uri) => {
        if (this.file_filter(uri.fsPath)) {
          await this.update_file_in_project(uri.fsPath);
          this.emit_call_graph_changed();
        }
      })
    );

    // Handle file deletion
    this.disposables.push(
      this.file_watcher.onDidDelete((uri) => {
        if (this.file_filter(uri.fsPath)) {
          this.project!.remove_file(uri.fsPath as FilePath);
          console.log(`Removed file from project: ${uri.fsPath}`);
          this.emit_call_graph_changed();
        }
      })
    );

    // Also watch for text document changes for more granular updates
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const document = event.document;

        // Only process if it's a file in our workspace and matches our filter
        if (document.uri.scheme === "file" && document.uri.fsPath.startsWith(this.workspace_path)) {
          try {
            if (this.file_filter(document.uri.fsPath)) {
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
    this.project!.update_file(document.uri.fsPath as FilePath, document.getText());

    // Debounce the call graph update to avoid too many updates
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
    const call_graph = this.project!.get_call_graph();
    this.on_call_graph_changed_emitter.fire(call_graph);
  }

  /**
   * Get the current call graph
   */
  getCallGraph(): CallGraph {
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
