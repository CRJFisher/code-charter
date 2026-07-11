import * as vscode from 'vscode';

/**
 * Watches the on-disk graph store (`<workspace>/.code-charter/graph.db`) and fires a settled callback
 * when an out-of-process reconcile writes it. The reconcile commits in WAL and checkpoints back into
 * graph.db when it closes; the write can land as several rapid events, so — like UIDevWatcher — the
 * callback is debounced to run once the write has settled. Read-only by construction: the watcher never
 * opens the store, it only signals that a re-read is due.
 */
export class StoreWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private debounce_timer: NodeJS.Timeout | undefined;

  constructor(
    private store_dir: string,
    private file_name: string,
    private on_change_callback: () => void,
    private settle_ms: number = 1000,
  ) {}

  start(): void {
    if (this.watcher) {
      return;
    }

    const pattern = new vscode.RelativePattern(this.store_dir, this.file_name);
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const debounced_callback = () => {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = setTimeout(() => {
        this.on_change_callback();
      }, this.settle_ms);
    };

    this.watcher.onDidChange(debounced_callback);
    this.watcher.onDidCreate(debounced_callback);
  }

  dispose(): void {
    // Clear any pending settle timer before dropping the watcher, so a write that landed within the
    // settle window right before disposal can't fire the callback against an already-torn-down panel.
    clearTimeout(this.debounce_timer);
    this.debounce_timer = undefined;
    this.watcher?.dispose();
    this.watcher = undefined;
  }
}
