/**
 * Build the `drift` MCP server: a low-level {@link Server} that advertises the two user-facing
 * tools (`drift_list`, `drift_resolve`) and dispatches each call to its pure handler plus call
 * logging. Tool inputs are declared as JSON Schema (the MCP wire shape) and validated per call
 * with an explicit zod parse — this sidesteps the `McpServer.registerTool` generic-inference
 * explosion while keeping argument typing exact. The transport is supplied by the caller
 * (`server.connect(...)`), so this stays testable with the SDK's in-memory transport.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { GraphStore } from "@code-charter/types";

import type { LogCall } from "./call_log";
import { drift_list, drift_resolve } from "./drift_tool";
import { DRIFT_SERVER_NAME, DRIFT_SERVER_VERSION, TOOL_DRIFT_LIST, TOOL_DRIFT_RESOLVE } from "./tool_names";

const LIST_INPUT = z.object({ scope: z.string().optional() });
const RESOLVE_INPUT = z.object({ id: z.string(), resolution: z.enum(["reattach", "delete"]) });

const TOOL_DEFINITIONS = [
  {
    name: TOOL_DRIFT_LIST,
    description:
      "List the drift re-attachment bin: user-authored and agentic diagram content detached " +
      "from the code it described, awaiting reattachment or deletion. Read-only.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", description: "Optional path/id prefix to narrow the bin." } },
    },
  },
  {
    name: TOOL_DRIFT_RESOLVE,
    description:
      "Resolve one re-attachment bin entry: 'reattach' restores it, 'delete' keeps it removed. " +
      "Operates only on entries currently in the bin.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The node id or edge key of the bin entry to resolve." },
        resolution: { type: "string", enum: ["reattach", "delete"] },
      },
      required: ["id", "resolution"],
    },
  },
] as const;

function text_result(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/** Construct (but do not connect) the `drift` MCP server backed by `store`, logging to `log`. */
export function build_drift_server(store: GraphStore, log: LogCall): Server {
  const server = new Server(
    { name: DRIFT_SERVER_NAME, version: DRIFT_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [...TOOL_DEFINITIONS] }));

  server.setRequestHandler(CallToolRequestSchema, (request, extra): CallToolResult => {
    const caller = extra.sessionId ?? "unknown";
    const { name, arguments: raw_args } = request.params;

    if (name === TOOL_DRIFT_LIST) {
      const args = LIST_INPUT.parse(raw_args ?? {});
      return text_result(drift_list(store, args, { caller, log }));
    }
    if (name === TOOL_DRIFT_RESOLVE) {
      const args = RESOLVE_INPUT.parse(raw_args ?? {});
      return text_result(drift_resolve(store, args, { caller, log }));
    }
    throw new Error(`unknown drift tool: ${name}`);
  });

  return server;
}
