import { describe, expect, it } from "@jest/globals";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { NullGraphStore } from "@code-charter/core";

import type { DriftCallLogEntry } from "./call_log";
import { build_drift_server } from "./build_drift_server";
import { TOOL_DRIFT_LIST, TOOL_DRIFT_RESOLVE } from "./tool_names";

async function connected_client(): Promise<{ client: Client; log: DriftCallLogEntry[] }> {
  const log: DriftCallLogEntry[] = [];
  const server = build_drift_server(new NullGraphStore(), (entry) => log.push(entry));
  const [client_transport, server_transport] = InMemoryTransport.createLinkedPair();
  await server.connect(server_transport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(client_transport);
  return { client, log };
}

describe("build_drift_server", () => {
  it("registers exactly the two drift tools", async () => {
    const { client } = await connected_client();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([TOOL_DRIFT_LIST, TOOL_DRIFT_RESOLVE].sort());
    await client.close();
  });

  it("drift_list is callable and logs the call (empty bin on NullGraphStore)", async () => {
    const { client, log } = await connected_client();
    const result = await client.callTool({ name: TOOL_DRIFT_LIST, arguments: {} });
    const content = result.content;
    const text = Array.isArray(content) && content[0]?.type === "text" ? content[0].text : "";
    expect(JSON.parse(text)).toEqual([]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tool: TOOL_DRIFT_LIST });
    await client.close();
  });

  it("drift_resolve is callable and logs the call", async () => {
    const { client, log } = await connected_client();
    await client.callTool({ name: TOOL_DRIFT_RESOLVE, arguments: { id: "x", resolution: "delete" } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ tool: TOOL_DRIFT_RESOLVE });
    await client.close();
  });
});
