import { CodeCharterBackend } from "@code-charter/types";
import { VSCodeBackend } from "./vscode_backend";
import { MockBackend } from "./mock_backend";

export enum BackendType {
  VSCODE = "vscode",
  MOCK = "mock",
  // Future: MCP = "mcp",
}

/**
 * Configuration for backend creation
 */
export interface BackendConfig {
  type: BackendType;
  // Future config options for different backends
  options?: Record<string, any>;
}

/**
 * Factory for creating backend instances
 */
export class BackendProvider {
  private static currentBackend: CodeCharterBackend | null = null;

  /**
   * Create a backend instance based on configuration
   */
  static createBackend(config: BackendConfig): CodeCharterBackend {
    switch (config.type) {
      case BackendType.VSCODE:
        return new VSCodeBackend();
      
      case BackendType.MOCK:
        return new MockBackend();
      
      default:
        throw new Error(`Unknown backend type: ${config.type}`);
    }
  }

  /**
   * Get or create the current backend instance
   */
  static getBackend(config?: BackendConfig): CodeCharterBackend {
    if (!this.currentBackend && config) {
      this.currentBackend = this.createBackend(config);
    }
    
    if (!this.currentBackend) {
      // Auto-detect backend type
      const detectedConfig = this.detectBackendConfig();
      this.currentBackend = this.createBackend(detectedConfig);
    }
    
    return this.currentBackend;
  }

  /**
   * Reset the current backend (useful for testing)
   */
  static resetBackend(): void {
    if (this.currentBackend) {
      this.currentBackend.disconnect();
      this.currentBackend = null;
    }
  }

  /**
   * Auto-detect the appropriate backend configuration
   */
  private static detectBackendConfig(): BackendConfig {
    // Check if we're in VSCode context
    if (typeof acquireVsCodeApi !== "undefined") {
      return { type: BackendType.VSCODE };
    }
    
    // Default to mock backend for demos/testing
    return { type: BackendType.MOCK };
  }
}

// Global declaration for VSCode API detection
declare const acquireVsCodeApi: any;