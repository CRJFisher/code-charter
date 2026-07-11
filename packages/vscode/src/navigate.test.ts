import { describe, expect, it } from "@jest/globals";
import * as vscode from "vscode";

import { get_opposite_column } from "./navigate";

const { One, Two, Three } = vscode.ViewColumn;

describe("get_opposite_column", () => {
  it("sends the doc to column Two when the only open editor sits in column One", () => {
    expect(get_opposite_column(One, [One])).toBe(Two);
  });

  it("sends the doc to column One when the only open editor sits in column Two", () => {
    expect(get_opposite_column(Two, [Two])).toBe(One);
  });

  it("targets the column the webview is not in when both columns are already open", () => {
    expect(get_opposite_column(One, [One, Two])).toBe(Two);
    expect(get_opposite_column(Two, [One, Two])).toBe(One);
  });

  it("collapses duplicate columns before choosing, so two editors in one column read as a single split", () => {
    expect(get_opposite_column(One, [One, One])).toBe(Two);
  });

  it("ignores editors with no view column when counting the split", () => {
    expect(get_opposite_column(One, [One, undefined])).toBe(Two);
  });

  it("falls back to column Two when nothing is open yet", () => {
    expect(get_opposite_column(undefined, [])).toBe(Two);
  });

  it("falls back to column Two when three or more columns are open", () => {
    expect(get_opposite_column(One, [One, Two, Three])).toBe(Two);
  });
});
