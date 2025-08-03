// Navigation utilities for opening files in VS Code

// VS Code API interface
interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export interface NavigateOptions {
  file_path: string;
  line_number: number;
  column_number?: number;
}

export function navigateToFile(options: NavigateOptions): void {
  const { file_path, line_number, column_number = 1 } = options;
  
  // VS Code URL scheme format: vscode://file/{full_path}:{line}:{column}
  const vscodeUrl = `vscode://file/${file_path}:${line_number}:${column_number}`;
  
  // Try to open the URL
  try {
    // For VS Code webview context, post a message to the extension
    if (typeof acquireVsCodeApi !== 'undefined') {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'openFile',
        file_path,
        line_number,
        column_number,
      });
    } else {
      // Fallback for standalone/browser context
      window.open(vscodeUrl, '_blank');
    }
  } catch (error) {
    console.error('Failed to navigate to file:', error);
  }
}

// Helper to check if we're in a VS Code context
export function isVSCodeContext(): boolean {
  return typeof acquireVsCodeApi !== 'undefined';
}