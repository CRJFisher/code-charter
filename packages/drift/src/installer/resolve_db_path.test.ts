import { describe, expect, it } from "@jest/globals";
import * as path from "node:path";

import { resolve_db_path } from "./resolve_db_path";

describe("resolve_db_path", () => {
  it("defaults to .code-charter/graph.db under cwd when the env var is unset", () => {
    expect(resolve_db_path({}, "/repo")).toBe(path.join("/repo", ".code-charter", "graph.db"));
  });

  it("returns an absolute CODE_CHARTER_DB override as-is", () => {
    expect(resolve_db_path({ CODE_CHARTER_DB: "/var/db/graph.db" }, "/repo")).toBe("/var/db/graph.db");
  });

  it("joins a relative CODE_CHARTER_DB override to cwd", () => {
    expect(resolve_db_path({ CODE_CHARTER_DB: "custom/graph.db" }, "/repo")).toBe(
      path.join("/repo", "custom", "graph.db"),
    );
  });

  it("treats an empty CODE_CHARTER_DB as unset", () => {
    expect(resolve_db_path({ CODE_CHARTER_DB: "" }, "/repo")).toBe(
      path.join("/repo", ".code-charter", "graph.db"),
    );
  });
});
