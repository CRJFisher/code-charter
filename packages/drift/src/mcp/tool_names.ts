/**
 * The user-facing `drift` MCP tool surface.
 *
 * Registered tool names are dot-free identifiers (`drift_list`, `drift_resolve`): a dot in an
 * MCP tool `name` is rejected by clients that flatten the namespace (Claude Code surfaces a
 * server tool as `mcp__<server>__<tool>`, and `<tool>` must be `[a-z0-9_]`). The conceptual
 * surface is documented as the `drift.*` family; the server itself is named `drift`.
 */

export const DRIFT_SERVER_NAME = "drift";
export const DRIFT_SERVER_VERSION = "0.0.1";

export const TOOL_DRIFT_LIST = "drift_list";
export const TOOL_DRIFT_RESOLVE = "drift_resolve";
