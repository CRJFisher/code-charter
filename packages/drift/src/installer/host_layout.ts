/**
 * The host-keyed install layout: each host describes WHERE the drift substrate lands — the
 * settings file and its hooks envelope key, plus the asset directories — so the installer never
 * hardcodes `.claude/settings.json`. A new host (Cursor, `.agents`, `.codex`) is a new
 * {@link HostLayout} entry in {@link HOST_LAYOUTS}, not a caller change. Only the Claude-Code
 * target ships today.
 */

export type HostKey = "claude_code";

export type HookEventName = "Stop";

/** The only hook type this substrate installs. */
export interface HookCommand {
  type: "command";
  command: string;
}

/** Foreign groups under `settings.hooks.<event>` may carry a `matcher`; ours never do. */
export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

export interface HookArtifactSpec {
  event_name: HookEventName;
  command: string;
  /** A stable substring of `command` used to recognise our own entry on re-install. */
  identity_token: string;
}

/** `source_subdir` is relative to the package's `assets/` tree; `target_subdir` to the install root. */
export interface AssetDirSpec {
  source_subdir: string;
  target_subdir: string;
}

export interface HostLayout {
  host_key: HostKey;
  /** Holds the hook entries, relative to the install root. */
  settings_file: string;
  /** Top-level settings key under which per-event hook arrays live. */
  hooks_key: string;
  agents: AssetDirSpec;
  skills: AssetDirSpec;
  commands: AssetDirSpec;
}

export const CLAUDE_CODE_LAYOUT: HostLayout = {
  host_key: "claude_code",
  settings_file: ".claude/settings.json",
  hooks_key: "hooks",
  agents: { source_subdir: "agents", target_subdir: ".claude/agents" },
  skills: { source_subdir: "skills", target_subdir: ".claude/skills" },
  commands: { source_subdir: "commands", target_subdir: ".claude/commands" },
};

export const HOST_LAYOUTS: Record<HostKey, HostLayout> = {
  claude_code: CLAUDE_CODE_LAYOUT,
};

/** The substrate's own groups carry no matcher. */
export function build_hook_group(spec: HookArtifactSpec): HookGroup {
  return { hooks: [{ type: "command", command: spec.command }] };
}
