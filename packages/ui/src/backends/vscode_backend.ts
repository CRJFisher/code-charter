import {
  CodeCharterBackend,
  NodeGroup,
  DocstringSummaries,
  CallGraph,
  SerializedCallGraph,
  deserialize_call_graph,
} from "@code-charter/types";

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface ResponseMessage<T = unknown> {
  id: string;
  command: string;
  data?: T;
}

let cached_vscode_api: VsCodeApi | undefined;
function get_vscode_api(): VsCodeApi {
  if (cached_vscode_api) {
    return cached_vscode_api;
  }
  if (typeof acquireVsCodeApi !== "function") {
    throw new Error("VSCode API not available");
  }
  cached_vscode_api = acquireVsCodeApi();
  return cached_vscode_api;
}

/**
 * VSCode backend adapter that wraps the existing postMessage API
 */
export class VSCodeBackend implements CodeCharterBackend {
  private vscode: VsCodeApi;
  private messageQueue: Map<string, (response: ResponseMessage) => void> = new Map();

  constructor() {
    this.vscode = get_vscode_api();

    window.addEventListener("message", (event: MessageEvent) => {
      const message: ResponseMessage = event.data;
      const { id } = message;

      const resolve = this.messageQueue.get(id);
      if (resolve) {
        resolve(message);
        this.messageQueue.delete(id);
      }
    });
  }

  async getCallGraph(): Promise<CallGraph | undefined> {
    try {
      const response = await this.sendMessageWithResponse<SerializedCallGraph>("getCallGraph");
      return response.data ? deserialize_call_graph(response.data) : undefined;
    } catch (error) {
      console.error("Error getting call graph:", error);
      return undefined;
    }
  }

  async clusterCodeTree(topLevelFunctionSymbol: string): Promise<NodeGroup[]> {
    try {
      const response = await this.sendMessageWithResponse<NodeGroup[]>("clusterCodeTree", { topLevelFunctionSymbol });
      return response.data || [];
    } catch (error) {
      console.error("Error clustering:", error);
      return [];
    }
  }

  async get_code_tree_descriptions(topLevelFunctionSymbol: string): Promise<DocstringSummaries | undefined> {
    try {
      const response = await this.sendMessageWithResponse<DocstringSummaries>("getCodeTreeDescriptions", { topLevelFunctionSymbol });
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

  private sendMessageWithResponse<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {}
  ): Promise<ResponseMessage<T>> {
    return new Promise((resolve) => {
      const messageId = Math.random().toString(36).substring(7);
      this.messageQueue.set(messageId, resolve as (response: ResponseMessage) => void);
      this.vscode.postMessage({ id: messageId, command, ...payload });
    });
  }
}

declare function acquireVsCodeApi(): VsCodeApi;
