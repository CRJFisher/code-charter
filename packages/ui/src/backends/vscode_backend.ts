import {
  CodeCharterBackend,
  NodeGroup,
  DocstringSummaries,
  CallGraph
} from "@code-charter/types";

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

  constructor() {
    if (typeof acquireVsCodeApi === "function") {
      this.vscode = acquireVsCodeApi();
    } else {
      throw new Error("VSCode API not available");
    }

    // Set up message handler
    window.addEventListener("message", (event: MessageEvent) => {
      const message: ResponseMessage = event.data;
      const { id } = message;

      if (this.messageQueue.has(id)) {
        const resolve = this.messageQueue.get(id)!;
        resolve(message);
        this.messageQueue.delete(id);
      }
    });
  }

  async getCallGraph(): Promise<CallGraph | undefined> {
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

  async get_code_tree_descriptions(topLevelFunctionSymbol: string): Promise<DocstringSummaries | undefined> {
    try {
      const response = await this.sendMessageWithResponse("getCodeTreeDescriptions", { topLevelFunctionSymbol });
      return response.data;
    } catch (error) {
      console.error("Error getting code tree descriptions:", error);
      return undefined;
    }
  }

  async navigateToDoc(relativeDocPath: string, lineNumber: number): Promise<void> {
    try {
      await this.sendMessageWithResponse("navigateToDoc", { relativeDocPath, lineNumber });
    } catch (error) {
      console.error("Error navigating to document:", error);
      throw error;
    }
  }

  private sendMessageWithResponse(command: string, payload: any = {}): Promise<ResponseMessage> {
    return new Promise((resolve) => {
      const messageId = Math.random().toString(36).substring(7);
      this.messageQueue.set(messageId, resolve);
      this.vscode.postMessage({ id: messageId, command, ...payload });
    });
  }
}

// Global declaration for VSCode API
declare function acquireVsCodeApi(): VsCodeApi;
