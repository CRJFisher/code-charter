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
  private message_queue: Map<string, PendingRequest> = new Map();

  constructor() {
    this.vscode = get_vscode_api();

    window.addEventListener("message", (event: MessageEvent) => {
      const message: ResponseMessage = event.data;
      const { id } = message;

      const pending = this.message_queue.get(id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.message_queue.delete(id);
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

  async get_call_graph(): Promise<CallGraph | undefined> {
    try {
      const response = await this.send_message_with_response<SerializedCallGraph>("get_call_graph");
      return response.data ? deserialize_call_graph(response.data) : undefined;
    } catch (error) {
      console.error("Error getting call graph:", error);
      return undefined;
    }
  }

  async cluster_code_tree(top_level_function_symbol: string): Promise<NodeGroup[]> {
    try {
      const response = await this.send_message_with_response<NodeGroup[]>(
        "cluster_code_tree",
        { top_level_function_symbol }
      );
      return response.data || [];
    } catch (error) {
      console.error("Error clustering:", error);
      return [];
    }
  }

  async get_code_tree_descriptions(top_level_function_symbol: string): Promise<DocstringSummaries | undefined> {
    const response = await this.send_message_with_response<DocstringSummaries>(
      "get_code_tree_descriptions",
      { top_level_function_symbol }
    );
    return response.data;
  }

  async navigate_to_doc(file_path: string, line_number: number): Promise<void> {
    try {
      await this.send_message_with_response("navigate_to_doc", { file_path, line_number });
    } catch (error) {
      console.error("Error navigating to document:", error);
      throw error;
    }
  }

  private send_message_with_response<T = unknown>(
    command: string,
    payload: Record<string, unknown> = {}
  ): Promise<ResponseMessage<T>> {
    return new Promise<ResponseMessage<T>>((resolve, reject) => {
      const message_id = Math.random().toString(36).substring(2);
      const timeout = setTimeout(() => {
        this.message_queue.delete(message_id);
        reject(new Error(`Webview command "${command}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.message_queue.set(message_id, {
        resolve: resolve as (response: ResponseMessage) => void,
        reject,
        timeout,
      });
      this.vscode.postMessage({ id: message_id, command, ...payload });
    });
  }
}
