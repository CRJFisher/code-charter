/**
 * Learn which files were worked on this turn by parsing the session transcript (JSONL). The
 * `Stop` hook payload carries `transcript_path`, not an edited-file list, so the canonical
 * signal is the file-editing tool-use entries in the transcript: `Edit`/`Write`/`MultiEdit`
 * carry `input.file_path`; `NotebookEdit` carries `input.notebook_path`. Parsing is defensive —
 * malformed or irrelevant lines are skipped so a single bad line never breaks the hook.
 */

import { is_record } from "./hook_payloads";

/** The file-editing tools whose tool-use entries mark a worked-on file. */
export const EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
]);

function file_path_from_tool_use(item: Record<string, unknown>): string | null {
  if (item.type !== "tool_use" || typeof item.name !== "string" || !EDIT_TOOL_NAMES.has(item.name)) {
    return null;
  }
  if (!is_record(item.input)) {
    return null;
  }
  const file_path = item.input.file_path;
  if (typeof file_path === "string" && file_path.length > 0) {
    return file_path;
  }
  const notebook_path = item.input.notebook_path;
  if (typeof notebook_path === "string" && notebook_path.length > 0) {
    return notebook_path;
  }
  return null;
}

function file_paths_from_line(parsed: unknown): string[] {
  if (!is_record(parsed) || parsed.type !== "assistant" || !is_record(parsed.message)) {
    return [];
  }
  const content = parsed.message.content;
  if (!Array.isArray(content)) {
    return [];
  }
  const paths: string[] = [];
  for (const item of content) {
    if (is_record(item)) {
      const file_path = file_path_from_tool_use(item);
      if (file_path !== null) {
        paths.push(file_path);
      }
    }
  }
  return paths;
}

/** The distinct files edited in `transcript_text`, in first-seen order. */
export function parse_worked_on_files(transcript_text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of transcript_text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    for (const file_path of file_paths_from_line(parsed)) {
      if (!seen.has(file_path)) {
        seen.add(file_path);
        result.push(file_path);
      }
    }
  }
  return result;
}
