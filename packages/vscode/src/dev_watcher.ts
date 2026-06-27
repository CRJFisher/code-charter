import * as vscode from 'vscode';
import * as path from 'path';

export class UIDevWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private on_change_callback: () => void
  ) {}

  start(): void {
    if (this.watcher) {
      return;
    }

    const workspace_folders = vscode.workspace.workspaceFolders;
    if (!workspace_folders) {
      return;
    }

    const ui_dist_path = path.join(
      workspace_folders[0].uri.fsPath,
      'packages',
      'ui',
      'dist',
      'standalone.global.js'
    );

    const pattern = new vscode.RelativePattern(
      path.dirname(ui_dist_path),
      'standalone.global.js'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    let debounce_timer: NodeJS.Timeout;
    // The bundler rewrites the file in several rapid passes; debounce so the
    // webview reloads once the write has settled rather than mid-build.
    const debounced_callback = () => {
      clearTimeout(debounce_timer);
      debounce_timer = setTimeout(() => {
        console.log('UI package changed, reloading webview...');
        this.on_change_callback();
      }, 1000);
    };

    this.watcher.onDidChange(debounced_callback);
    this.watcher.onDidCreate(debounced_callback);

    this.context.subscriptions.push(this.watcher);

    vscode.window.showInformationMessage(
      'Code Charter: Development mode enabled. Webview will reload when UI package changes.'
    );
  }
}
