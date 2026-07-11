import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { ReconcileRunRecord } from "../reconcile/reconcile_log";
import { RECONCILE_RECORD_SCHEMA_VERSION } from "../reconcile/reconcile_log";
import { read_inspect_input } from "./read_input";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "read-input-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write_log(record: ReconcileRunRecord): void {
  fs.writeFileSync(path.join(dir, "drift_reconcile_log.jsonl"), JSON.stringify(record) + "\n");
}

function record(): ReconcileRunRecord {
  return {
    schema_version: RECONCILE_RECORD_SCHEMA_VERSION,
    run_id: "20260710T120000000Z-aabbccdd",
    session_id: "s1",
    instruction: null,
    timestamp: "2026-07-10T12:00:30.000Z",
    detail: {
      mode: "default",
      file_set: [],
      outcomes: [],
      deferred_retirements: [],
      deferred_skill_syncs: [],
      description_counts: { docstring: 0, provisional: 0, placeholder: 0, llm: 0 },
      diagnostics: [],
    },
  };
}

describe("read_inspect_input", () => {
  it("reads a never-reconciled store (no db file) as the empty input, not an error", () => {
    const input = read_inspect_input(path.join(dir, "graph.db"));

    expect(input.nodes).toEqual([]);
    expect(input.edges).toEqual([]);
    expect(input.latest_record).toBeNull();
    expect(input.sync_status).toBeNull();
  });

  it("folds in the run-log and status sidecars even when the db file is absent", () => {
    write_log(record());
    fs.writeFileSync(
      path.join(dir, "drift_reconcile_status.json"),
      JSON.stringify({ last_attempt_at: "2026-07-10T12:00:30.000Z" }),
    );

    const input = read_inspect_input(path.join(dir, "graph.db"));

    expect(input.nodes).toEqual([]);
    expect(input.latest_record?.run_id).toBe("20260710T120000000Z-aabbccdd");
    expect(input.sync_status?.last_attempt_at).toBe("2026-07-10T12:00:30.000Z");
  });
});
