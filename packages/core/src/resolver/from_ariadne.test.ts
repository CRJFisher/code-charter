import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Project } from "@ariadnejs/core";
import type { AnyDefinition, FilePath, ScopeId } from "@ariadnejs/types";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import { derive_code_state } from "./code_state";
import {
  type AriadneFileInput,
  parse_scope_range,
  resolver_symbols_from_ariadne,
  slice_source,
} from "./from_ariadne";

describe("parse_scope_range", () => {
  it("reads the trailing range from a scope id", () => {
    expect(parse_scope_range("function:/p/s.ts:6:20:8:1" as ScopeId)).toEqual({
      start_line: 6,
      start_col: 20,
      end_line: 8,
      end_col: 1,
    });
  });

  it("throws when the trailing four fields are not plain decimals", () => {
    expect(() => parse_scope_range("function:/p/s.ts:6:20" as ScopeId)).toThrow(/malformed scope id/);
    expect(() => parse_scope_range("function:/p/s.ts:6::8:1" as ScopeId)).toThrow(/malformed scope id/);
    expect(() => parse_scope_range("function:/p/s.ts:6:20:8:1e3" as ScopeId)).toThrow(/malformed scope id/);
  });
});

describe("slice_source", () => {
  const lines = ["export function top() {", "  return 42;", "}"];

  it("slices a multi-line span (1-indexed lines, 0-indexed columns)", () => {
    expect(slice_source(lines, { start_line: 1, start_col: 0, end_line: 3, end_col: 1 })).toBe(
      "export function top() {\n  return 42;\n}",
    );
  });

  it("slices a single-line span", () => {
    expect(slice_source(lines, { start_line: 2, start_col: 2, end_line: 2, end_col: 8 })).toBe("return");
  });
});

describe("resolver_symbols_from_ariadne (real Ariadne parse)", () => {
  const SOURCE = [
    "export class X {",
    "  run() {",
    "    return this.a;",
    "  }",
    "}",
    "export class Y {",
    "  run() {",
    "    return this.b;",
    "  }",
    "}",
    "export interface I {",
    "  ping(): void;",
    "}",
    "export function top() {",
    "  return 1;",
    "}",
    "",
  ].join("\n");

  let dir: string;
  let input: AriadneFileInput[];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "resolver-adapter-"));
    const file_abs = join(dir, "s.ts") as FilePath;
    writeFileSync(file_abs, SOURCE);
    const project = new Project();
    await project.initialize(dir as FilePath);
    project.update_file(file_abs, SOURCE);
    const idx = project.get_index_single_file(file_abs);
    if (!idx) throw new Error("no semantic index for fixture file");
    const definitions: AnyDefinition[] = [
      ...idx.functions.values(),
      ...idx.classes.values(),
      ...idx.interfaces.values(),
      ...idx.enums.values(),
    ];
    input = [{ file_path: "s.ts", source: SOURCE, definitions }];
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("derives distinct file-qualified symbol_paths for same-named methods on different classes", () => {
    const symbols = resolver_symbols_from_ariadne(input);
    const paths = symbols.map((s) => derive_code_state(s).symbol_path);

    expect(paths).toContain("s.ts#X.run:method");
    expect(paths).toContain("s.ts#Y.run:method");
    expect(paths).toContain("s.ts#top:function");
    // The two `run` methods are distinct, not collapsed.
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("slices the real body span for each symbol", () => {
    const symbols = resolver_symbols_from_ariadne(input);
    const x_run = symbols.find((s) => s.name === "run" && s.enclosing[0] === "X");

    expect(x_run).toBeDefined();
    expect(x_run?.body_source).toContain("this.a");
  });

  it("skips signature-only methods that have no body", () => {
    const symbols = resolver_symbols_from_ariadne(input);
    // The interface method `I.ping` has no body_scope_id and must not be anchored.
    expect(symbols.some((s) => s.name === "ping")).toBe(false);
  });
});
