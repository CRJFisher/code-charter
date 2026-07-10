/**
 * The session-transcript join: `~/.claude/projects/<slug(cwd)>/<session_id>.jsonl`. The record
 * stores a DERIVED path (docs/contracts/reconcile_run_record.md) so any downstream reader can
 * recompute it from the join key alone — the hook payload's live `transcript_path` is process
 * context that dies with the hook, and copying it would leave the rule unrecoverable. The slug
 * rule is pinned against observed host behavior (`/`, `.`, and `_` all map to `-`; case and
 * digits survive); the Stop hook tripwires its derivation against the payload's live path on
 * every fire, so a host-side rule change surfaces as a stderr note instead of silent misjoins.
 */

import * as os from "node:os";
import * as path from "node:path";

export function slugify_claude_project_dir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function derive_transcript_path(
  cwd: string,
  session_id: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const config_dir =
    env.CLAUDE_CONFIG_DIR !== undefined && env.CLAUDE_CONFIG_DIR.length > 0
      ? env.CLAUDE_CONFIG_DIR
      : path.join(os.homedir(), ".claude");
  return path.join(config_dir, "projects", slugify_claude_project_dir(cwd), `${session_id}.jsonl`);
}

/**
 * A sub-agent's own transcript lives under a per-session directory named after the main
 * transcript minus its `.jsonl` suffix: `<session_id>/subagents/agent-<agentId>.jsonl`, with a
 * sibling `agent-<agentId>.meta.json` ({ agentType, toolUseId, ... }). Pinned against the
 * observed host layout, like the project-dir slug above.
 */
export function derive_subagent_transcript_path(transcript_path: string, agent_id: string): string {
  return path.join(transcript_path.replace(/\.jsonl$/, ""), "subagents", `agent-${agent_id}.jsonl`);
}
