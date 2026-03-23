// VS Code API interface
interface VsCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

// Helper to check if we're in a VS Code context
export function isVSCodeContext(): boolean {
  return typeof acquireVsCodeApi !== 'undefined';
}
