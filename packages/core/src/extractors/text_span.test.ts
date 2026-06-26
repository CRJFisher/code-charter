import { format_range } from "./text_span";

describe("format_range", () => {
  it("formats a single-line span with 1-indexed line and 0-indexed columns", () => {
    expect(format_range("hello world", 6, 11)).toBe("1:6-1:11");
  });

  it("formats a span starting at offset 0 as column 0", () => {
    expect(format_range("hello", 0, 5)).toBe("1:0-1:5");
  });

  it("counts newlines so a span on the second line reports line 2", () => {
    const source = ["line one", "line two"].join("\n");
    expect(format_range(source, 9, 13)).toBe("2:0-2:4");
  });

  it("resets the column at the start of each line", () => {
    const source = "ab\ncd";
    expect(format_range(source, 3, 5)).toBe("2:0-2:2");
  });

  it("spans across a newline boundary", () => {
    const source = "ab\ncd";
    expect(format_range(source, 1, 4)).toBe("1:1-2:1");
  });

  it("reports the column as the raw distance from the last newline, even past end of source", () => {
    expect(format_range("abc", 0, 99)).toBe("1:0-1:99");
  });

  it("formats an empty span where start equals end", () => {
    expect(format_range("abc", 2, 2)).toBe("1:2-1:2");
  });

  it("handles an empty source string", () => {
    expect(format_range("", 0, 0)).toBe("1:0-1:0");
  });
});
