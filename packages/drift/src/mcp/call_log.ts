/**
 * Plain call logging for the `drift` MCP surface: one JSON line per tool call, carrying a
 * timestamp and the calling session. This is deliberately NOT a reserved audit path and adds
 * no table to the store (task-27.0 reserves no audit table) — it is a flat append-only log.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** One logged tool call. */
export interface DriftCallLogEntry {
  /** ISO-8601 timestamp of the call. */
  timestamp: string;
  /** The calling session id (from the MCP request), or "unknown" when the host supplies none. */
  caller: string;
  /** The registered tool name that was invoked. */
  tool: string;
  /** A shallow copy of the call arguments. */
  args: Record<string, unknown>;
}

/** Sink for call-log entries. Production appends to a file; tests collect in an array. */
export type LogCall = (entry: DriftCallLogEntry) => void;

/** Current wall-clock time as an ISO-8601 string. */
export function now_iso(): string {
  return new Date().toISOString();
}

/**
 * A {@link LogCall} that appends each entry as one JSON line to `log_path`, creating parent
 * directories as needed. Logging must never break a tool call, so all I/O errors are swallowed.
 */
export function make_append_logger(log_path: string): LogCall {
  return (entry: DriftCallLogEntry) => {
    try {
      fs.mkdirSync(path.dirname(log_path), { recursive: true });
      fs.appendFileSync(log_path, JSON.stringify(entry) + "\n");
    } catch {
      // A failed log write is never allowed to fail the underlying tool call.
    }
  };
}
