// Mirrors the VS Code webview API exactly; method names are dictated by the
// platform and cannot be renamed.
/* eslint-disable @typescript-eslint/naming-convention, no-var */
export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
  var acquireVsCodeApi: (() => VsCodeApi) | undefined;
}
/* eslint-enable @typescript-eslint/naming-convention, no-var */

// Helper to check if we're in a VS Code context
export function is_vscode_context(): boolean {
  return typeof globalThis.acquireVsCodeApi === "function";
}

// VSCode allows `acquireVsCodeApi()` to be called at most ONCE per webview
// instance. Cache the instance at module scope so every consumer in the
// webview bundle shares it.
let cached_vscode_api: VsCodeApi | undefined;
export function get_vscode_api(): VsCodeApi {
  if (cached_vscode_api) {
    return cached_vscode_api;
  }
  if (typeof globalThis.acquireVsCodeApi !== "function") {
    throw new Error("VSCode API not available");
  }
  cached_vscode_api = globalThis.acquireVsCodeApi();
  return cached_vscode_api;
}
