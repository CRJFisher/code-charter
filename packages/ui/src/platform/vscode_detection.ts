// VS Code API interface
export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

// Helper to check if we're in a VS Code context
export function isVSCodeContext(): boolean {
  return typeof acquireVsCodeApi !== 'undefined';
}

// VSCode allows `acquireVsCodeApi()` to be called at most ONCE per webview
// instance. Cache the instance at module scope so every consumer in the
// webview bundle shares it.
let cached_vscode_api: VsCodeApi | undefined;
export function get_vscode_api(): VsCodeApi {
  if (cached_vscode_api) {
    return cached_vscode_api;
  }
  if (typeof acquireVsCodeApi !== 'function') {
    throw new Error('VSCode API not available');
  }
  cached_vscode_api = acquireVsCodeApi();
  return cached_vscode_api;
}
