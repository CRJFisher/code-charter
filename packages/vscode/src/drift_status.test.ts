import { describe, expect, it } from "@jest/globals";
import type { FlowOutcome, SyncStatus } from "@code-charter/drift";

import { drift_bar_state, format_preview_outcomes, format_sync_status } from "./drift_status";

describe("drift_bar_state", () => {
  it("reads as armed, no warning, when the hook is installed", () => {
    const state = drift_bar_state(true);
    expect(state.text).toContain("armed");
    expect(state.warn).toBe(false);
  });

  it("reads as NOT installed, with a warning, when the hook is missing", () => {
    const state = drift_bar_state(false);
    expect(state.text).toContain("NOT installed");
    expect(state.warn).toBe(true);
  });
});

describe("format_sync_status", () => {
  it("reports the cold-repo case when no reconcile has run", () => {
    const status: SyncStatus = { last_attempt_at: null, last_success_at: null, last_error: null };
    expect(format_sync_status(status)).toContain("no reconcile recorded");
  });

  it("flags UNHEALTHY when the last reconcile failed", () => {
    const status: SyncStatus = {
      last_attempt_at: "2026-07-08T10:00:00Z",
      last_success_at: "2026-07-07T10:00:00Z",
      last_error: { at: "2026-07-08T10:00:00Z", message: "join miss" },
    };
    const rendered = format_sync_status(status);
    expect(rendered).toContain("UNHEALTHY");
    expect(rendered).toContain("join miss");
  });

  it("flags an in-flight/interrupted run when attempt is newer than success and no error", () => {
    const status: SyncStatus = {
      last_attempt_at: "2026-07-08T10:00:00Z",
      last_success_at: "2026-07-07T10:00:00Z",
      last_error: null,
    };
    expect(format_sync_status(status)).toContain("in flight or was interrupted");
  });

  it("reads healthy when the last attempt succeeded", () => {
    const status: SyncStatus = {
      last_attempt_at: "2026-07-07T10:00:00Z",
      last_success_at: "2026-07-07T10:00:00Z",
      last_error: null,
    };
    expect(format_sync_status(status)).toContain("healthy");
  });
});

describe("format_preview_outcomes", () => {
  it("notes no-op when no flow would change", () => {
    const rendered = format_preview_outcomes([]);
    expect(rendered).toContain("no store mutation, no tokens");
    expect(rendered).toContain("no flows would change");
  });

  it("renders one line per would-be outcome with action, kind, members, and reason", () => {
    const outcomes: FlowOutcome[] = [
      {
        flow_id: "main.ts#entry:function",
        action: "hydrate",
        kind: "code",
        member_count: 2,
        last_synced_at: "2026-07-09T00:00:00.000Z",
        reason: "new entrypoint over the changed files",
      },
      {
        flow_id: "main.ts#old:function",
        action: "retire",
        kind: "code",
        member_count: 0,
        last_synced_at: null,
        reason: "seed entrypoint gone",
      },
    ];
    const rendered = format_preview_outcomes(outcomes);
    expect(rendered).toContain("hydrate main.ts#entry:function (code, 2 member(s)) — new entrypoint over the changed files");
    expect(rendered).toContain("retire main.ts#old:function (code, 0 member(s)) — seed entrypoint gone");
  });
});
