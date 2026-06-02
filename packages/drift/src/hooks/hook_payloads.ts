/**
 * Wire shapes for the Claude Code `Stop` and `SessionStart` hooks. Input fields use the host's
 * snake_case payload keys; OUTPUT fields (`decision`, `reason`, `systemMessage`,
 * `hookSpecificOutput`, `hookEventName`, `additionalContext`) keep the host's exact camelCase
 * spelling because they are the external hook wire contract, not internal identifiers.
 */

/** Subset of the `Stop` hook input this substrate reads. */
export interface StopHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  /** True when Claude is already continuing because of a prior Stop-hook block (loop guard). */
  stop_hook_active?: boolean;
}

/** Subset of the `SessionStart` hook input this substrate reads. */
export interface SessionStartHookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  source?: string;
}

/** `Stop` hook output that blocks the stop and feeds an instruction back to the main agent. */
export interface StopHookOutput {
  decision: "block";
  reason: string;
  systemMessage: string;
}

/** `SessionStart` hook output that injects read-only context (the outstanding-drift banner). */
export interface SessionStartHookOutput {
  hookSpecificOutput?: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function is_stop_hook_input(value: unknown): value is StopHookInput {
  return is_record(value) && typeof value.transcript_path === "string";
}

export function is_session_start_hook_input(value: unknown): value is SessionStartHookInput {
  return is_record(value) && typeof value.cwd === "string";
}
