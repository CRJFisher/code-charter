import {
  CodeCharterBackend,
  NodeGroup,
  DocstringSummaries,
  CallGraph,
  SerializedCallGraph,
  deserialize_call_graph,
} from "@code-charter/types";
import { get_vscode_api, type VsCodeApi } from "../platform/vscode_detection";

interface ResponseError {
  message: string;
  stack?: string;
}

interface ResponseMessage<T = unknown> {
  id: string;
  command: string;
  data?: T;
  error?: ResponseError;
}

// Watchdog for hung requests. The extension host may silently drop messages
// if structured-clone fails on the response payload; without a timeout the
// promise dangles forever and the UI spinner sits there indefinitely.
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * VSCode backend adapter that wraps the existing postMessage API
 */
interface PendingRequest {
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class VSCodeBackend implements CodeCharterBackend {
  private vscode: VsCodeApi;
  private messageQueue: Map<string, PendingRequest> = new Map();

  constructor() {
    this.vscode = get_vscode_api();

    window.addEventListener("message", (event: MessageEvent) => {
      const message: ResponseMessage = event.data;
      const { id } = message;

      const pending = this.messageQueue.get(id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.messageQueue.delete(id);
      if (message.error) {
        const err = new Error(message.error.message);
        if (message.error.stack) {
          err.stack = message.error.stack;
        }
        pending.reject(err);
      } else {
        pending.resolve(message);
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
    const response = await this.sendMessageWithResponse<DocstringSummaries>("getCodeTreeDescriptions", { topLevelFunctionSymbol });
    return response.data;
  }

  async navigateToDoc(file_path: string, line_number: number): Promise<void> {
    try {
      await this.sendMessageWithResponse("navigateToDoc", { file_path, line_number });
    } catch (error) {
      console.error("Error navigating to document:", error);
      throw error;
    }
  }

  private sendMessageWithResponse<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {}
  ): Promise<ResponseMessage<T>> {
    return new Promise<ResponseMessage<T>>((resolve, reject) => {
      const messageId = Math.random().toString(36).substring(2);
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId);
        reject(new Error(`Webview command "${command}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.messageQueue.set(messageId, {
        resolve: resolve as (response: ResponseMessage) => void,
        reject,
        timeout,
      });
      this.vscode.postMessage({ id: messageId, command, ...payload });
    });
  }
}
