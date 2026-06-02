/**
 * Idempotent, non-destructive merges into a host's settings / MCP config. Every function takes
 * the existing config as `unknown` (it may be absent, empty, or shaped by the user) and returns
 * a NEW object, touching only the drift substrate's own entries and preserving everything else.
 *
 * Hook idempotency rides a command identity token: re-installing drops every prior drift group
 * for the event and appends exactly one fresh group, so re-running always leaves exactly one
 * `Stop` entry and one `SessionStart` entry even if a past run left duplicates.
 */

import {
  build_hook_group,
  type HookArtifactSpec,
  type HookEventName,
  type HookGroup,
  type HostLayout,
} from "./host_layout";

function is_plain_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function as_record(value: unknown): Record<string, unknown> {
  return is_plain_record(value) ? value : {};
}

function as_array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** True when `group` is a drift-owned hook group, recognised by the command identity token. */
export function hook_group_is_ours(group: unknown, identity_token: string): boolean {
  const record = as_record(group);
  const hooks = as_array(record.hooks);
  return hooks.some((hook) => {
    const command = as_record(hook).command;
    return typeof command === "string" && command.includes(identity_token);
  });
}

/** Merge one hook spec into `settings`, replacing any prior drift group for that event. */
export function merge_hook_entry(
  settings: unknown,
  layout: HostLayout,
  spec: HookArtifactSpec,
): Record<string, unknown> {
  const root = { ...as_record(settings) };
  const hooks = { ...as_record(root[layout.hooks_key]) };
  const existing = as_array(hooks[spec.event_name]);
  const others = existing.filter((group) => !hook_group_is_ours(group, spec.identity_token));
  hooks[spec.event_name] = [...others, build_hook_group(spec)];
  root[layout.hooks_key] = hooks;
  return root;
}

/** Merge every hook spec into `settings`. */
export function merge_all_hooks(
  settings: unknown,
  layout: HostLayout,
  specs: readonly HookArtifactSpec[],
): Record<string, unknown> {
  return specs.reduce<Record<string, unknown>>(
    (accumulated, spec) => merge_hook_entry(accumulated, layout, spec),
    as_record(settings),
  );
}

/** A `mcpServers` entry — the Claude Code MCP registration wire shape. */
export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** Register (or refresh) one MCP server under `mcpServers`, preserving other servers. */
export function merge_mcp_server(
  config: unknown,
  server_name: string,
  entry: McpServerEntry,
): Record<string, unknown> {
  const root = { ...as_record(config) };
  const servers = { ...as_record(root.mcpServers) };
  servers[server_name] = entry;
  root.mcpServers = servers;
  return root;
}

function is_hook_group(value: unknown): value is HookGroup {
  const record = as_record(value);
  if (!Array.isArray(record.hooks)) {
    return false;
  }
  return record.hooks.every((hook) => {
    const hook_record = as_record(hook);
    return hook_record.type === "command" && typeof hook_record.command === "string";
  });
}

/** The installed hook groups for `event` — a typed, validated view of the settings envelope. */
export function read_hook_groups(
  settings: unknown,
  layout: HostLayout,
  event: HookEventName,
): HookGroup[] {
  const hooks = as_record(as_record(settings)[layout.hooks_key]);
  return as_array(hooks[event]).filter(is_hook_group);
}

/** The registered MCP server `name`, or null when absent/malformed. */
export function read_mcp_server(config: unknown, name: string): McpServerEntry | null {
  const record = as_record(as_record(config).mcpServers)[name];
  const entry = as_record(record);
  if (typeof entry.command !== "string" || !Array.isArray(entry.args)) {
    return null;
  }
  return { command: entry.command, args: entry.args.filter((arg): arg is string => typeof arg === "string") };
}
