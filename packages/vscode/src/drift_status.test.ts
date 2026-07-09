import { describe, expect, it } from "@jest/globals";
import type { SyncStatus } from "@code-charter/drift";

import { drift_bar_state, format_sync_status } from "./drift_status";

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
