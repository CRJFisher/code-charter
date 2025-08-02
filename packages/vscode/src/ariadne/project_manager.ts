import * as vscode from "vscode";
import { Project, CallGraph } from "@ariadnejs/core";
import * as fs from "fs";
import * as path from "path";

export class AriadneProjectManager {
  private project: Project;
  private workspacePath: string;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];
  private fileFilter: (path: string) => boolean;
  private onCallGraphChangedEmitter = new vscode.EventEmitter<CallGraph>();
  
  // Public event that fires when the call graph changes
  public readonly onCallGraphChanged = this.onCallGraphChangedEmitter.event;

  constructor(
    workspacePath: string,
    fileFilter: (path: string) => boolean = () => true
  ) {
    this.workspacePath = workspacePath;
    this.fileFilter = fileFilter;
    this.project = new Project();
  }

  /**
   * Initialize the project by scanning all files and setting up watchers
   */
  async initialize(): Promise<CallGraph> {
    console.log("Initializing AriadneProjectManager...");
    
    // Initial scan of all files
    await this.scanDirectory(this.workspacePath);
    
    // Set up file watchers
    this.setupFileWatchers();
    
    // Return initial call graph
    return this.project.get_call_graph();
  }

  /**
   * Scan a directory recursively and add all matching files to the project
   */
  private async scanDirectory(dirPath: string): Promise<void> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (this.shouldSkipDirectory(entry.name)) {
          continue;
        }
        await this.scanDirectory(fullPath);
      } else if (entry.isFile() && this.fileFilter(fullPath)) {
        await this.addFileToProject(fullPath);
      }
    }
  }

  /**
   * Check if a directory should be skipped
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      "node_modules",
      ".git",
      "__pycache__",
      ".vscode",
      "dist",
      "out",
      "build",
      ".next",
      ".cache"
    ];
    return skipDirs.includes(dirName) || dirName.startsWith(".");
  }

  /**
   * Add a file to the project
   */
  private async addFileToProject(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const relativePath = path.relative(this.workspacePath, filePath);
      this.project.add_or_update_file(relativePath, content);
      console.log(`Added file to project: ${relativePath}`);
    } catch (error) {
      console.error(`Error adding file ${filePath}:`, error);
    }
  }

  /**
   * Set up file system watchers for incremental updates
   */
  private setupFileWatchers(): void {
    // Create a file watcher for the workspace
    const pattern = new vscode.RelativePattern(this.workspacePath, "**/*");
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    // Handle file creation
    this.disposables.push(
      this.fileWatcher.onDidCreate(async (uri) => {
        if (this.fileFilter(uri.fsPath)) {
          await this.addFileToProject(uri.fsPath);
          this.emitCallGraphChanged();
        }
      })
    );
    
    // Handle file changes
    this.disposables.push(
      this.fileWatcher.onDidChange(async (uri) => {
        if (this.fileFilter(uri.fsPath)) {
          await this.updateFile(uri.fsPath);
          this.emitCallGraphChanged();
        }
      })
    );
    
    // Handle file deletion
    this.disposables.push(
      this.fileWatcher.onDidDelete((uri) => {
        if (this.fileFilter(uri.fsPath)) {
          const relativePath = path.relative(this.workspacePath, uri.fsPath);
          this.project.remove_file(relativePath);
          console.log(`Removed file from project: ${relativePath}`);
          this.emitCallGraphChanged();
        }
      })
    );
    
    // Also watch for text document changes for more granular updates
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const document = event.document;
        
        // Only process if it's a file in our workspace and matches our filter
        if (document.uri.scheme === "file" && document.uri.fsPath.startsWith(this.workspacePath)) {
          try {
            if (this.fileFilter(document.uri.fsPath)) {
              await this.handleDocumentChange(document, event.contentChanges);
            }
          } catch (error) {
            console.error(`Filter error for ${document.uri.fsPath}:`, error);
          }
        }
      })
    );
  }

  /**
   * Update a file in the project
   */
  private async updateFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const relativePath = path.relative(this.workspacePath, filePath);
      this.project.add_or_update_file(relativePath, content);
      console.log(`Updated file in project: ${relativePath}`);
    } catch (error) {
      console.error(`Error updating file ${filePath}:`, error);
    }
  }

  /**
   * Handle incremental document changes
   */
  private async handleDocumentChange(
    document: vscode.TextDocument,
    _changes: readonly vscode.TextDocumentContentChangeEvent[]
  ): Promise<void> {
    const relativePath = path.relative(this.workspacePath, document.uri.fsPath);
    
    // For now, we'll do a full file update since the API doesn't expose
    // update_file_range in a way that maps easily to VSCode's change events
    // In the future, we could optimize this by using update_file_range
    this.project.add_or_update_file(relativePath, document.getText());
    
    // Debounce the call graph update to avoid too many updates
    this.debounceCallGraphUpdate();
  }

  private updateTimer: NodeJS.Timeout | undefined;
  
  /**
   * Debounce call graph updates to avoid excessive recalculation
   */
  private debounceCallGraphUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.emitCallGraphChanged();
    }, 500); // Wait 500ms after last change
  }

  /**
   * Emit that the call graph has changed
   */
  private emitCallGraphChanged(): void {
    const callGraph = this.project.get_call_graph();
    this.onCallGraphChangedEmitter.fire(callGraph);
  }

  /**
   * Get the current call graph
   */
  getCallGraph(): CallGraph {
    return this.project.get_call_graph();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.fileWatcher?.dispose();
    this.onCallGraphChangedEmitter.dispose();
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}