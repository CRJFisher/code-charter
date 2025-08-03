import { symbolDisplayName } from "../symbol_utils";

describe("symbolDisplayName", () => {
  it("should extract the last part of a symbol", () => {
    expect(symbolDisplayName("namespace::class::method")).toBe("method");
    expect(symbolDisplayName("module::function")).toBe("function");
    expect(symbolDisplayName("package::subpackage::class::property")).toBe("property");
  });

  it("should handle single-part symbols", () => {
    expect(symbolDisplayName("function")).toBe("function");
    expect(symbolDisplayName("variable")).toBe("variable");
  });

  it("should handle empty strings", () => {
    expect(symbolDisplayName("")).toBe("");
  });

  it("should handle symbols ending with ::", () => {
    expect(symbolDisplayName("namespace::class::")).toBe("namespace::class::");
    expect(symbolDisplayName("module::")).toBe("module::");
  });

  it("should handle symbols with multiple consecutive ::", () => {
    expect(symbolDisplayName("namespace::::method")).toBe("method");
    expect(symbolDisplayName("::class::method")).toBe("method");
  });

  it("should handle special characters in symbol names", () => {
    expect(symbolDisplayName("namespace::my-function")).toBe("my-function");
    expect(symbolDisplayName("module::_privateMethod")).toBe("_privateMethod");
    expect(symbolDisplayName("package::Class<T>::method")).toBe("method");
  });

  it("should handle numeric parts", () => {
    expect(symbolDisplayName("namespace::func1")).toBe("func1");
    expect(symbolDisplayName("module::123")).toBe("123");
  });

  it("should handle symbols with spaces (edge case)", () => {
    expect(symbolDisplayName("namespace::my function")).toBe("my function");
  });

  it("should handle very long symbol paths", () => {
    const longPath = "a::b::c::d::e::f::g::h::i::j::k::finalPart";
    expect(symbolDisplayName(longPath)).toBe("finalPart");
  });

  it("should handle symbols with file paths", () => {
    expect(symbolDisplayName("/path/to/file.ts::function")).toBe("function");
    expect(symbolDisplayName("src/components/App.tsx::Component::render")).toBe("render");
  });
});