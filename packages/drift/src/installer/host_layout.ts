/**
 * The host-keyed install layout. Each host describes WHERE the drift substrate lands — the
 * settings file and its hooks envelope key, and the asset directories — so the installer never
 * hardcodes `.claude/settings.json`. Adding a Cursor / `.agents` / `.codex` target is a new
 * {@link HostLayout} entry in {@link HOST_LAYOUTS}, not a caller refactor (task-27.1.8 keeps
 * the portability decision open). v1 ships only the Claude-Code target.
 */

export type HostKey = "claude_code";

export type HookEventName = "Stop";

/** A `{ type: "command", command }` hook (the only hook type this substrate installs). */
export interface HookCommand {
  type: "command";
  command: string;
}

/** A matcher-group as nested under `settings.hooks.<event>`; foreign groups may carry a matcher. */
export interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

/** One hook entry to install: its event, command, and the idempotency token. */
export interface HookArtifactSpec {
  event_name: HookEventName;
  command: string;
  /** A stable substring of `command` used to recognise our own entry on re-install. */
  identity_token: string;
}

/** A directory of assets to copy from the package's `assets/` tree into the host. */
export interface AssetDirSpec {
  source_subdir: string;
  target_subdir: string;
}

export interface HostLayout {
  host_key: HostKey;
  /** Settings file (relative to the install root) holding the hook entries. */
  settings_file: string;
  /** Top-level key in the settings envelope under which per-event hook arrays live. */
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

/** Build the matcher-group object for a hook spec (the substrate's own groups carry no matcher). */
export function build_hook_group(spec: HookArtifactSpec): HookGroup {
  return { hooks: [{ type: "command", command: spec.command }] };
}
