import { CodeCharterBackend } from "@code-charter/types";
import { VSCodeBackend } from "./vscode_backend";
import { MockBackend } from "./mock_backend";

export enum BackendType {
  VSCODE = "vscode",
  MOCK = "mock",
}

export interface BackendConfig {
  type: BackendType;
  options?: Record<string, any>;
}

// Global declaration for VSCode API detection
declare const acquireVsCodeApi: any;

export function detect_backend_config(): BackendConfig {
  if (typeof acquireVsCodeApi !== "undefined") {
    return { type: BackendType.VSCODE };
  }
  return { type: BackendType.MOCK };
}

export function create_backend(config?: BackendConfig): CodeCharterBackend {
  const resolved = config ?? detect_backend_config();
  switch (resolved.type) {
    case BackendType.VSCODE:
      return new VSCodeBackend();
    case BackendType.MOCK:
      return new MockBackend();
    default:
      throw new Error(`Unknown backend type: ${resolved.type}`);
  }
}
