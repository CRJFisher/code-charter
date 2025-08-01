import {
  CodeCharterBackend,
  BackendState,
  ConnectionStatus,
  NodeGroup,
  TreeAndContextSummaries
} from "./types";

interface VsCodeApi {
  postMessage(message: any): void;
}

type ResponseMessage = {
  id: string;
  command: string;
  data?: any;
  [key: string]: any;
};

/**
 * VSCode backend adapter that wraps the existing postMessage API
 */
export class VSCodeBackend implements CodeCharterBackend {
  private vscode: VsCodeApi;
  private messageQueue: Map<string, (response: ResponseMessage) => void> = new Map();
  private state: BackendState = { status: ConnectionStatus.DISCONNECTED };
  private stateListeners: Set<(state: BackendState) => void> = new Set();
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor() {
    // Check if we're in VSCode context
    if (typeof acquireVsCodeApi === "function") {
      this.vscode = acquireVsCodeApi();
    } else {
      throw new Error("VSCode API not available");
    }
  }

  getState(): BackendState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.updateState({ status: ConnectionStatus.CONNECTING });

    try {
      // Set up message handler
      this.messageHandler = (event: MessageEvent) => {
        const message: ResponseMessage = event.data;
        const { id } = message;

        if (this.messageQueue.has(id)) {
          const resolve = this.messageQueue.get(id)!;
          resolve(message);
          this.messageQueue.delete(id);
        }
      };

      window.addEventListener("message", this.messageHandler);
      
      // Verify connection by sending a test message
      // For now, just mark as connected
      this.updateState({ status: ConnectionStatus.CONNECTED });
    } catch (error) {
      this.updateState({ 
        status: ConnectionStatus.ERROR, 
        error: error instanceof Error ? error.message : "Connection failed" 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.messageQueue.clear();
    this.updateState({ status: ConnectionStatus.DISCONNECTED });
  }

  async getCallGraph(): Promise<any | undefined> {
    try {
      const response = await this.sendMessageWithResponse("getCallGraph");
      return response.data;
    } catch (error) {
      console.error("Error getting call graph:", error);
      return undefined;
    }
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
    try {
      const response = await this.sendMessageWithResponse("clusterCodeTree", { topLevelFunctionSymbol });
      return response.data || [];
    } catch (error) {
      console.error("Error clustering:", error);
      return [];
    }
  }

  async summariseCodeTree(topLevelFunctionSymbol: string): Promise<TreeAndContextSummaries | undefined> {
    try {
      const response = await this.sendMessageWithResponse("summariseCodeTree", { topLevelFunctionSymbol });
      return response.data;
    } catch (error) {
      console.error("Error summarising code tree:", error);
      return undefined;
    }
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    try {
      const response = await this.sendMessageWithResponse("navigateToDoc", { relativeDocPath, lineNumber });
      const { data: { success } } = response;
      if (!success) {
        throw new Error(response.message || "Navigation failed");
      }
    } catch (error) {
      console.error("Error navigating to document:", error);
      throw error;
    }
  }

  onStateChange(callback: (state: BackendState) => void): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  private sendMessageWithResponse(command: string, payload: any = {}): Promise<ResponseMessage> {
    if (this.state.status !== ConnectionStatus.CONNECTED) {
      return Promise.reject(new Error("Backend not connected"));
    }

    return new Promise((resolve) => {
      const messageId = Math.random().toString(36).substring(7);
      this.messageQueue.set(messageId, resolve);
      this.vscode.postMessage({ id: messageId, command, ...payload });
    });
  }

  private updateState(state: BackendState): void {
    this.state = state;
    this.stateListeners.forEach(listener => listener(state));
  }
}

// Global declaration for VSCode API
declare function acquireVsCodeApi(): VsCodeApi;