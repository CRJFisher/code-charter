/**
 * Build the `drift` MCP server: a low-level {@link Server} that advertises the `drift_resolve` tool
 * and dispatches each call to its pure handler plus call logging. Tool inputs are declared as JSON
 * Schema (the MCP wire shape) and validated per call with an explicit zod parse — this sidesteps the
 * `McpServer.registerTool` generic-inference explosion while keeping argument typing exact. The
 * transport is supplied by the caller (`server.connect(...)`), so this stays testable with the SDK's
 * in-memory transport.
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
import { drift_resolve } from "./drift_tool";
import { DRIFT_SERVER_NAME, DRIFT_SERVER_VERSION, TOOL_DRIFT_RESOLVE } from "./tool_names";

const RESOLVE_INPUT = z.object({
  kind: z.enum(["node", "edge"]),
  id: z.string(),
  resolution: z.enum(["reanchor"]),
});

const TOOL_DEFINITIONS = [
  {
    name: TOOL_DRIFT_RESOLVE,
    description:
      "Resolve one outstanding drift: 'reanchor' commits a staged relocation, moving diagram content " +
      "onto the renamed symbol. `kind` says whether `id` is a node or an edge.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["node", "edge"],
          description: "Whether `id` is a node id or an edge key — addressed explicitly, no id-only disambiguation.",
        },
        id: { type: "string", description: "The node id (or edge key) of the drift to resolve." },
        resolution: { type: "string", enum: ["reanchor"] },
      },
      required: ["kind", "id", "resolution"],
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
    // `sessionId` is the MCP SDK's RequestHandlerExtra wire field, not an internal identifier.
    const caller = extra.sessionId ?? "unknown";
    const { name, arguments: raw_args } = request.params;

    if (name === TOOL_DRIFT_RESOLVE) {
      const args = RESOLVE_INPUT.parse(raw_args ?? {});
      return text_result(drift_resolve(store, args, { caller, log }));
    }
    throw new Error(`unknown drift tool: ${name}`);
  });

  return server;
}
