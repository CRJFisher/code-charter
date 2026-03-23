// Navigation utilities for opening files in VS Code
import { isVSCodeContext } from '../../platform/vscode_detection';

// Cache the VS Code API instance at module scope so acquireVsCodeApi() is called once
let cached_vscode_api: ReturnType<typeof acquireVsCodeApi> | null = null;

function get_vscode_api(): ReturnType<typeof acquireVsCodeApi> {
  if (!cached_vscode_api) {
    cached_vscode_api = acquireVsCodeApi();
  }
  return cached_vscode_api;
}

export interface NavigateOptions {
  file_path: string;
  line_number: number;
  column_number?: number;
}

export function navigateToFile(options: NavigateOptions): void {
  const { file_path, line_number, column_number = 1 } = options;

  try {
    if (isVSCodeContext()) {
      get_vscode_api().postMessage({
        command: 'openFile',
        file_path,
        line_number,
        column_number,
      });
    } else {
      const vscodeUrl = `vscode://file/${file_path}:${line_number}:${column_number}`;
      window.open(vscodeUrl, '_blank');
    }
  } catch (error) {
    console.error('Failed to navigate to file:', error);
  }
}
