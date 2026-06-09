import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The drift-sync bundled script ships as an asset and runs standalone (hosts without the Skill tool run
// it directly), so its contract is the CLI surface: validate args, fetch the staged pending set when no
// explicit `--files` is given (consuming it on success), no-op an empty set, and shell into the located
// `drift-reconcile` bin forwarding the pinned flags + exit code. The real engine is covered by
// reconcile.e2e.test.ts; here a fake bin stands in so the script's own job is tested in isolation.
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

/** A tmp store dir with an optionally staged pending-reconcile file. */
function make_store_dir(staged_files: string[] | null): { store: string; pending: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-store-"));
  const store = path.join(dir, "graph.db");
  const pending = path.join(dir, "drift_pending_reconcile.json");
  if (staged_files !== null) {
    fs.writeFileSync(pending, JSON.stringify({ files: staged_files }));
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
    expect(JSON.parse(fs.readFileSync(pending, "utf8"))).toEqual({ files: ["src/staged.ts"] });
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
});
