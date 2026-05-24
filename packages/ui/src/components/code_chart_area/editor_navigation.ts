// Navigation utilities for opening files in VS Code
import { get_vscode_api, is_vscode_context } from '../../platform/vscode_detection';

export interface NavigateOptions {
  file_path: string;
  line_number: number;
  column_number?: number;
}

export function navigate_to_file(options: NavigateOptions): void {
  const { file_path, line_number, column_number = 1 } = options;

  try {
    if (is_vscode_context()) {
      // Fire-and-forget request to the extension's navigate_to_doc handler.
      // The shared VS Code API instance is owned by vscode_detection so the
      // backend bridge and these click handlers don't fight over the one-shot
      // acquireVsCodeApi() call.
      get_vscode_api().postMessage({
        command: 'navigate_to_doc',
        file_path,
        line_number,
        column_number,
      });
    } else {
      const vscode_url = `vscode://file/${file_path}:${line_number}:${column_number}`;
      window.open(vscode_url, '_blank');
    }
  } catch (error) {
    console.error('Failed to navigate to file:', error);
  }
}
