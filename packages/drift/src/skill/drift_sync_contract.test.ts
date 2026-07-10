import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  parse_pending_reconcile,
  serialize_pending_reconcile,
  type PendingSession,
} from "../hooks/pending_reconcile";

// The drift-sync bundled script ships as an asset and runs standalone (hosts without the Skill tool run
// it directly), so its contract is the CLI surface: validate args, claim the staged pending set when no
// explicit `--files` is given (deleting the claim on success, unioning it back on failure), no-op an
// empty set, and shell into the located `drift-reconcile` bin forwarding the pinned flags + exit code.
// The real engine is covered by reconcile.e2e.test.ts; here a fake bin stands in so the script's own
// job is tested in isolation.
const SCRIPT = path.resolve(__dirname, "..", "..", "assets", "skills", "drift-sync", "scripts", "drift_sync.js");

let fake_bin_dir: string;
let fake_bin: string;

beforeAll(() => {
  fake_bin_dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-fakebin-"));
  fake_bin = path.join(fake_bin_dir, "fake_reconcile.js");
  // Echoes the args it received as JSON and exits with the code named by a trailing `--exit N`, so the
  // test can assert forwarding and exit-code propagation.
  fs.writeFileSync(
    fake_bin,
    [
      "const a = process.argv.slice(2);",
      "process.stdout.write(JSON.stringify(a));",
      "const i = a.indexOf('--exit');",
      "process.exit(i === -1 ? 0 : Number(a[i + 1]));",
    ].join("\n"),
  );
});

afterAll(() => {
  fs.rmSync(fake_bin_dir, { recursive: true, force: true });
});

function run(args: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const SESSION: PendingSession = {
  session_id: "s1",
  cwd: "/repo",
  instruction: "Launch the `drift-reconciler` sub-agent.",
};

/** A tmp store dir with an optionally staged pending-reconcile handoff. */
function make_store_dir(
  staged_files: string[] | null,
  session: PendingSession | null = null,
): { store: string; pending: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-store-"));
  const store = path.join(dir, "graph.db");
  const pending = path.join(dir, "drift_pending_reconcile.json");
  if (staged_files !== null) {
    fs.writeFileSync(pending, serialize_pending_reconcile({ files: staged_files, session }));
  }
  return { store, pending };
}

describe("drift-sync script contract", () => {
  it("forwards an explicit --files set to the located reconcile bin and propagates its exit code", () => {
    const result = run(
      ["--files", "src/a.ts,src/b.ts", "--store", "/tmp/g.db", "--repo-root", "/repo", "--json"],
      { DRIFT_RECONCILE_BIN: fake_bin },
    );
    expect(result.status).toBe(0);
    const forwarded = JSON.parse(result.stdout);
    expect(forwarded).toEqual(["--files", "src/a.ts,src/b.ts", "--store", "/tmp/g.db", "--repo-root", "/repo", "--json"]);
  });

  it("fetches the staged pending set when no --files is given, and consumes it on success", () => {
    const { store, pending } = make_store_dir(["src/a.ts", "src/b.ts"]);
    const result = run(["--store", store, "--repo-root", "/repo", "--json"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    const forwarded = JSON.parse(result.stdout);
    expect(forwarded).toEqual(["--files", "src/a.ts,src/b.ts", "--store", store, "--repo-root", "/repo", "--json"]);
    expect(fs.existsSync(pending)).toBe(false); // consumed — the handoff is complete
  });

  it("leaves the staged set unconsumed when the bin fails, so the next launch retries it", () => {
    const exiting_bin = path.join(fake_bin_dir, "exit4.js");
    fs.writeFileSync(exiting_bin, "process.exit(4);");
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: exiting_bin });
    expect(result.status).toBe(4);
    expect(fs.existsSync(pending)).toBe(true);
  });

  it("leaves the staged set unconsumed on --dry-run (detection only, no handoff)", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const result = run(["--store", store, "--repo-root", "/repo", "--dry-run"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(fs.existsSync(pending)).toBe(true);
  });

  it("leaves the staged set untouched when an explicit --files overrides it (the manual path)", () => {
    const { store, pending } = make_store_dir(["src/staged.ts"]);
    const result = run(["--files", "src/manual.ts", "--store", store, "--repo-root", "/repo"], {
      DRIFT_RECONCILE_BIN: fake_bin,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["--files", "src/manual.ts", "--store", store, "--repo-root", "/repo"]);
    expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual({
      files: ["src/staged.ts"],
      session: null,
    });
  });

  it("forwards the staged session context to the bin as --session-id/--session-cwd/--instruction", () => {
    const { store, pending } = make_store_dir(["src/a.ts"], SESSION);
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "--files",
      "src/a.ts",
      "--session-id",
      "s1",
      "--session-cwd",
      "/repo",
      "--instruction",
      "Launch the `drift-reconciler` sub-agent.",
      "--store",
      store,
      "--repo-root",
      "/repo",
    ]);
    expect(fs.existsSync(pending)).toBe(false);
  });

  it("restores the claimed session on union-back after a failed run", () => {
    const exiting_bin = path.join(fake_bin_dir, "exit5.js");
    fs.writeFileSync(exiting_bin, "process.exit(5);");
    const { store, pending } = make_store_dir(["src/a.ts"], SESSION);
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: exiting_bin });
    expect(result.status).toBe(5);
    expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual({
      files: ["src/a.ts"],
      session: SESSION,
    });
  });

  it("forwards --list-entrypoints with the staged set and consumes it on success (the list pass is the mutating reconcile)", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const result = run(["--list-entrypoints", "--store", store, "--repo-root", "/repo"], {
      DRIFT_RECONCILE_BIN: fake_bin,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["--list-entrypoints", "--files", "src/a.ts", "--store", store, "--repo-root", "/repo"]);
    expect(fs.existsSync(pending)).toBe(false);
  });

  it("no-ops --list-entrypoints with an empty inventory when nothing is staged", () => {
    const { store } = make_store_dir(null);
    const result = run(["--list-entrypoints", "--store", store, "--repo-root", "/repo"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ entrypoints: [] });
  });

  it("forwards --apply-stitch without touching the staged set (the judgement phases carry their own payload)", () => {
    const { store, pending } = make_store_dir(["src/staged.ts"]);
    const result = run(["--apply-stitch", "/tmp/stitch.json", "--store", store, "--repo-root", "/repo"], {
      DRIFT_RECONCILE_BIN: fake_bin,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["--apply-stitch", "/tmp/stitch.json", "--store", store, "--repo-root", "/repo"]);
    expect(fs.existsSync(pending)).toBe(true); // never read, never consumed
  });

  it("forwards --apply-descriptions without touching the staged set", () => {
    const { store, pending } = make_store_dir(["src/staged.ts"]);
    const result = run(["--apply-descriptions", "/tmp/d.json", "--store", store, "--repo-root", "/repo"], {
      DRIFT_RECONCILE_BIN: fake_bin,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["--apply-descriptions", "/tmp/d.json", "--store", store, "--repo-root", "/repo"]);
    expect(fs.existsSync(pending)).toBe(true);
  });

  it("rejects conflicting mode flags as a usage error", () => {
    const result = run(["--list-entrypoints", "--apply-stitch", "/tmp/s.json", "--store", "/x", "--repo-root", "/r"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("at most one mode flag");
  });

  it("no-ops cleanly when nothing is staged and no --files is given (exit 0)", () => {
    const { store } = make_store_dir(null);
    const result = run(["--store", store, "--repo-root", "/repo", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expect(result.stderr).toContain("nothing staged");
  });

  it("forwards --dry-run and propagates a non-zero exit code from the bin", () => {
    const exiting_bin = path.join(fake_bin_dir, "exit3.js");
    fs.writeFileSync(exiting_bin, "process.exit(3);");
    const result = run(
      ["--files", "a.ts", "--store", "/x", "--repo-root", "/r", "--dry-run"],
      { DRIFT_RECONCILE_BIN: exiting_bin },
    );
    expect(result.status).toBe(3);
  });

  it("no-ops cleanly on an empty file set without needing the bin (exit 0)", () => {
    const result = run(["--files", "", "--store", "/tmp/none.db", "--repo-root", "/repo", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
    expect(result.stderr).toContain("0 file(s)");
  });

  it("exits 1 with a clear message when the reconcile bin cannot be located", () => {
    const result = run(["--files", "a.ts", "--store", "/x", "--repo-root", "/r"], { DRIFT_RECONCILE_BIN: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reconcile bin not located");
  });

  it("exits 2 on a missing required argument", () => {
    const result = run(["--repo-root", "/repo"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing required --store");
  });

  it("exits 2 (never crashes) when a value-flag has no value", () => {
    const result = run(["--store", "/tmp/none.db", "--repo-root", "/repo", "--files"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing value for --files");
  });

  it("exits 2 when a value-flag is immediately followed by another flag", () => {
    const result = run(["--files", "a.ts", "--repo-root", "--store", "/x"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("missing value for --repo-root");
  });

  it("exits 2 on an unknown argument", () => {
    const result = run(["--files", "a.ts", "--store", "/x", "--repo-root", "/r", "--bogus"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown argument");
  });

  /** A bin that stages a fresh pending set while "reconciling" — a Stop fire mid-run. */
  function make_staging_bin(name: string, exit_code: number): string {
    const bin = path.join(fake_bin_dir, name);
    fs.writeFileSync(
      bin,
      [
        'const path = require("node:path");',
        'const fs = require("node:fs");',
        "const a = process.argv.slice(2);",
        'const store = a[a.indexOf("--store") + 1];',
        'fs.writeFileSync(path.join(path.dirname(store), "drift_pending_reconcile.json"), JSON.stringify({ files: ["src/mid.ts"] }));',
        "process.stdout.write(JSON.stringify(a));",
        `process.exit(${exit_code});`,
      ].join("\n"),
    );
    return bin;
  }

  /** A pid guaranteed dead: a child that has already exited by the time spawnSync returns. */
  function dead_pid(): number {
    const child = spawnSync("node", ["-e", ""]);
    if (child.pid === undefined) throw new Error("could not spawn a probe child");
    return child.pid;
  }

  function claim_path_in(store: string, pid: number): string {
    return path.join(path.dirname(store), `drift_pending_reconcile.claim.${pid}.json`);
  }

  /** Every claim file currently beside the store. */
  function claims_beside(store: string): string[] {
    return fs.readdirSync(path.dirname(store)).filter((name) => name.includes(".claim."));
  }

  it("claims the staged set before spawning, so a set staged mid-reconcile survives the consume", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const bin = make_staging_bin("stage_exit0.js", 0);
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: bin });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toContain("src/a.ts"); // only the claimed set was reconciled
    expect(JSON.parse(result.stdout)).not.toContain("src/mid.ts");
    // The mid-reconcile set survives the consume — this is the closed race.
    expect(JSON.parse(fs.readFileSync(pending, "utf8"))).toEqual({ files: ["src/mid.ts"] });
    expect(claims_beside(store)).toEqual([]);
  });

  it("unions the claimed set back into a pending file re-created mid-reconcile when the bin fails", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const bin = make_staging_bin("stage_exit4.js", 4);
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: bin });
    expect(result.status).toBe(4);
    // Claimed set first (first-seen order), mid-reconcile set preserved.
    expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual({
      files: ["src/a.ts", "src/mid.ts"],
      session: null,
    });
    expect(claims_beside(store)).toEqual([]);
  });

  it("recovers an orphaned claim from a crashed prior run into this run's set", () => {
    const { store, pending } = make_store_dir(["src/fresh.ts"]);
    fs.writeFileSync(claim_path_in(store, dead_pid()), JSON.stringify({ files: ["src/orphan.ts"] }));
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    const forwarded = JSON.parse(result.stdout) as string[];
    expect(forwarded).toContain("src/orphan.ts,src/fresh.ts"); // orphan folded in ahead of the fresh set
    expect(fs.existsSync(pending)).toBe(false);
    expect(claims_beside(store)).toEqual([]);
  });

  it("recovers a claim whose pid parses to zero rather than probing the process group", () => {
    const { store, pending } = make_store_dir(null);
    fs.writeFileSync(claim_path_in(store, 0), JSON.stringify({ files: ["src/zero.ts"] }));
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toContain("src/zero.ts");
    expect(fs.existsSync(pending)).toBe(false);
    expect(claims_beside(store)).toEqual([]);
  });

  it("never steals the claim of a live peer", () => {
    const { store } = make_store_dir(["src/a.ts"]);
    const peer_claim = claim_path_in(store, process.pid); // this test process is the live "peer"
    fs.writeFileSync(peer_claim, JSON.stringify({ files: ["src/live.ts"] }));
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    const forwarded = JSON.parse(result.stdout) as string[];
    expect(forwarded).toContain("src/a.ts");
    expect(forwarded.join(" ")).not.toContain("src/live.ts");
    expect(JSON.parse(fs.readFileSync(peer_claim, "utf8"))).toEqual({ files: ["src/live.ts"] });
  });

  it("does not claim on --dry-run (detection is side-effect-free)", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    const result = run(["--store", store, "--repo-root", "/repo", "--dry-run"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual({ files: ["src/a.ts"], session: null });
    expect(fs.readdirSync(path.dirname(store))).toEqual(["drift_pending_reconcile.json"]);
  });

  it("consumes a pending file written by the TS serializer (format cross-check)", () => {
    const { store, pending } = make_store_dir(null);
    fs.writeFileSync(pending, serialize_pending_reconcile({ files: ["src/a.ts", "src/b.ts"], session: SESSION }));
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      "--files",
      "src/a.ts,src/b.ts",
      "--session-id",
      "s1",
      "--session-cwd",
      "/repo",
      "--instruction",
      "Launch the `drift-reconciler` sub-agent.",
      "--store",
      store,
      "--repo-root",
      "/repo",
    ]);
    expect(fs.existsSync(pending)).toBe(false);
  });

  it("unions back a pending file the TS parser accepts (reverse format cross-check)", () => {
    const { store, pending } = make_store_dir(null);
    fs.writeFileSync(pending, serialize_pending_reconcile({ files: ["src/a.ts", "src/b.ts"], session: SESSION }));
    const bin = make_staging_bin("stage_exit6.js", 6); // re-stages src/mid.ts mid-run, then fails
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: bin });
    expect(result.status).toBe(6);
    // The multi-file union the JS writer emits must parse identically on the TS side. The
    // mid-reconcile set staged no session, so the claimed session is restored.
    expect(parse_pending_reconcile(fs.readFileSync(pending, "utf8"))).toEqual({
      files: ["src/a.ts", "src/b.ts", "src/mid.ts"],
      session: SESSION,
    });
    const residue = fs.readdirSync(path.dirname(store)).filter((name) => name.endsWith(".tmp"));
    expect(residue).toEqual([]);
  });

  it("discards a claimed malformed pending file instead of stranding a dead claim", () => {
    const { store, pending } = make_store_dir(null);
    fs.writeFileSync(pending, "not json");
    const result = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("nothing staged");
    expect(fs.existsSync(pending)).toBe(false);
    expect(claims_beside(store)).toEqual([]);
  });

  it("leaves the claim in place when the settle union cannot be written, and recovers it next launch", () => {
    const { store, pending } = make_store_dir(["src/a.ts"]);
    // A bin that replaces the live pending path with a directory (defeating the union-back
    // rename) and then fails — the settle cannot restage, so the claim must survive.
    const obstructing_bin = path.join(fake_bin_dir, "obstruct_exit4.js");
    fs.writeFileSync(
      obstructing_bin,
      [
        'const path = require("node:path");',
        'const fs = require("node:fs");',
        "const a = process.argv.slice(2);",
        'const store = a[a.indexOf("--store") + 1];',
        'fs.mkdirSync(path.join(path.dirname(store), "drift_pending_reconcile.json"));',
        "process.exit(4);",
      ].join("\n"),
    );
    const failed = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: obstructing_bin });
    expect(failed.status).toBe(4);
    const claims = claims_beside(store);
    expect(claims).toHaveLength(1); // the claim is the sole surviving record of the set
    expect(parse_pending_reconcile(fs.readFileSync(path.join(path.dirname(store), claims[0]), "utf8"))).toEqual({
      files: ["src/a.ts"],
      session: null,
    });
    fs.rmdirSync(pending); // the obstruction clears...
    const retried = run(["--store", store, "--repo-root", "/repo"], { DRIFT_RECONCILE_BIN: fake_bin });
    expect(retried.status).toBe(0); // ...and the next launch recovers the dead-pid claim
    expect(retried.stderr).toContain("recovered");
    expect(JSON.parse(retried.stdout)).toContain("src/a.ts");
    expect(fs.existsSync(pending)).toBe(false);
    expect(claims_beside(store)).toEqual([]);
  });
});
