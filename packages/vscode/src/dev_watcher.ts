import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Watch for changes in the UI package during development
 */
export class UIDevWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private onChangeCallback: () => void;

  constructor(
    private context: vscode.ExtensionContext,
    onChangeCallback: () => void
  ) {
    this.onChangeCallback = onChangeCallback;
  }

  start(): void {
    if (this.watcher) {
      return;
    }

    // Watch the UI package dist folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const uiDistPath = path.join(
      workspaceFolders[0].uri.fsPath,
      'packages',
      'ui',
      'dist',
      'standalone.global.js'
    );

    const pattern = new vscode.RelativePattern(
      path.dirname(uiDistPath),
      'standalone.global.js'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Debounce to avoid multiple rapid reloads
    let debounceTimer: NodeJS.Timeout;
    const debouncedCallback = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('UI package changed, reloading webview...');
        this.onChangeCallback();
      }, 1000);
    };

    this.watcher.onDidChange(debouncedCallback);
    this.watcher.onDidCreate(debouncedCallback);

    this.context.subscriptions.push(this.watcher);

    vscode.window.showInformationMessage(
      'Code Charter: Development mode enabled. Webview will reload when UI package changes.'
    );
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
  }
}