import { DatabaseSync } from "node:sqlite";

import { MIN_NODE_SQLITE_VERSION, is_node_sqlite_supported } from "./node_sqlite_support";

describe("is_node_sqlite_supported (AC#3 semver gate)", () => {
  it("accepts the exact minimum and above, rejects below — never a lexical compare", () => {
    expect(is_node_sqlite_supported("22.13.0")).toBe(true);
    expect(is_node_sqlite_supported("24.0.0")).toBe(true);
    expect(is_node_sqlite_supported("22.12.9")).toBe(false);
    // The lexical trap: "9.x" > "22.x" as strings, but 9 < 22 numerically.
    expect(is_node_sqlite_supported("9.99.99")).toBe(false);
  });

  it("strips a leading v and a prerelease suffix", () => {
    expect(is_node_sqlite_supported("v24.12.0")).toBe(true);
    expect(is_node_sqlite_supported("22.13.0-nightly")).toBe(true);
  });

  it("treats a Node-less host (no version) as unsupported", () => {
    expect(is_node_sqlite_supported(undefined)).toBe(false);
  });

  it("exposes the minimum version constant", () => {
    expect(MIN_NODE_SQLITE_VERSION).toBe("22.13.0");
  });
});

describe("node:sqlite availability (AC#9)", () => {
  it("loads on the runner and opens an in-memory database", () => {
    expect(typeof DatabaseSync).toBe("function");
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE probe (x INTEGER)");
    db.prepare("INSERT INTO probe (x) VALUES (?)").run(7);
    expect(db.prepare("SELECT x FROM probe").get()).toEqual({ x: 7 });
    db.close();
  });

  it("agrees the current runner is supported", () => {
    expect(is_node_sqlite_supported(process.versions.node)).toBe(true);
  });
});
