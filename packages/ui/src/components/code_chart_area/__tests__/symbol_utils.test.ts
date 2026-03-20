import { symbol_display_name } from "../symbol_utils";

describe("symbol_display_name", () => {
  it("should extract name from v0.8 SymbolId format (colon-separated)", () => {
    expect(symbol_display_name("function:src/utils.ts:10:0:20:1:processData")).toBe("processData");
    expect(symbol_display_name("method:src/class.ts:5:2:15:3:render")).toBe("render");
    expect(symbol_display_name("class:src/models.ts:1:0:50:0:UserModel")).toBe("UserModel");
  });

  it("should handle simple names without separators", () => {
    expect(symbol_display_name("function")).toBe("function");
    expect(symbol_display_name("variable")).toBe("variable");
  });

  it("should handle empty string", () => {
    expect(symbol_display_name("")).toBe("");
  });

  it("should handle names with special characters", () => {
    expect(symbol_display_name("function:src/utils.ts:1:0:10:0:my_function")).toBe("my_function");
    expect(symbol_display_name("method:src/class.ts:1:0:10:0:_privateMethod")).toBe("_privateMethod");
  });

  it("should handle various symbol kinds", () => {
    expect(symbol_display_name("constructor:src/class.ts:1:0:10:0:constructor")).toBe("constructor");
    expect(symbol_display_name("variable:src/config.ts:1:0:1:20:MAX_SIZE")).toBe("MAX_SIZE");
  });

  it("should handle long paths", () => {
    expect(symbol_display_name("function:src/deeply/nested/module/file.ts:100:0:200:0:deepFunction")).toBe("deepFunction");
  });
});
