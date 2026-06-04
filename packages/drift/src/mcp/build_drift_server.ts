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
import { drift_list, drift_next, drift_resolve } from "./drift_tool";
import {
  DRIFT_SERVER_NAME,
  DRIFT_SERVER_VERSION,
  TOOL_DRIFT_LIST,
  TOOL_DRIFT_NEXT,
  TOOL_DRIFT_RESOLVE,
} from "./tool_names";

const LIST_INPUT = z.object({ scope: z.string().optional() });
const NEXT_INPUT = z.object({ scope: z.string().optional() });
const RESOLVE_INPUT = z.object({
  kind: z.enum(["node", "edge"]),
  id: z.string(),
  resolution: z.enum(["reattach", "delete", "reanchor"]),
  target: z.string().optional(),
});

const TOOL_DEFINITIONS = [
  {
    name: TOOL_DRIFT_LIST,
    description:
      "List the drift re-attachment bin: user-authored and agentic diagram content detached " +
      "from the code it described, awaiting reattachment or deletion, oldest stranding first. Each " +
      "entry carries the stranded `description` text, `node_kind`, `intent_source`, a `user_authored` " +
      "flag, and a ranked `candidates[]` of plausible new target symbols (same file / body / name) so a " +
      "chooser can decide what to recover — and onto which symbol — without a follow-up read. Read-only.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", description: "Optional path/id prefix to narrow the bin." } },
    },
  },
  {
    name: TOOL_DRIFT_NEXT,
    description:
      "Return the next outstanding re-attachment-bin entry to resolve — the oldest stranding first, " +
      "within an optional `scope` — or null when the bin is empty. The loop primitive: call drift_next, " +
      "resolve its entry with drift_resolve, repeat until it returns null. The entry carries the same " +
      "payload (stranded text + ranked candidate targets) as a drift_list entry. Read-only.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", description: "Optional path/id prefix to narrow the bin." } },
    },
  },
  {
    name: TOOL_DRIFT_RESOLVE,
    description:
      "Resolve one outstanding drift: 'reanchor' commits a staged relocation, moving preserved " +
      "diagram content (its hand-written description intact) onto the renamed symbol; 'reattach' " +
      "restores a re-attachment bin entry — bare onto its original anchor, or onto a different live " +
      "symbol when `target` is given (carrying the hand-written description across); 'delete' keeps a " +
      "bin entry removed. `kind` says whether `id` is a node or an edge.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["node", "edge"],
          description: "Whether `id` is a node id or an edge key — addressed explicitly, no id-only disambiguation.",
        },
        id: { type: "string", description: "The node id (or edge key) of the drift to resolve." },
        resolution: { type: "string", enum: ["reattach", "delete", "reanchor"] },
        target: {
          type: "string",
          description:
            "Optional symbol_path of a live symbol to reattach the stranded node ONTO (from a drift.list " +
            "candidate). Omit to restore onto the original anchor. Only valid with resolution=reattach on a node.",
        },
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

    if (name === TOOL_DRIFT_LIST) {
      const args = LIST_INPUT.parse(raw_args ?? {});
      return text_result(drift_list(store, args, { caller, log }));
    }
    if (name === TOOL_DRIFT_NEXT) {
      const args = NEXT_INPUT.parse(raw_args ?? {});
      return text_result(drift_next(store, args, { caller, log }));
    }
    if (name === TOOL_DRIFT_RESOLVE) {
      const args = RESOLVE_INPUT.parse(raw_args ?? {});
      return text_result(drift_resolve(store, args, { caller, log }));
    }
    throw new Error(`unknown drift tool: ${name}`);
  });

  return server;
}
