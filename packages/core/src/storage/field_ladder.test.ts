import type { Tier } from "@code-charter/types";

import { apply_field_ladder } from "./field_ladder";

describe("apply_field_ladder", () => {
  it("writes a field with no recorded owner (defaults to raw) at any tier", () => {
    const attributes: Record<string, unknown> = {};
    const ownership: Record<string, Tier> = {};
    const result = apply_field_ladder(attributes, ownership, { label: "x" }, "user");
    expect(result).toEqual({ written: ["label"], skipped: [] });
    expect(attributes).toEqual({ label: "x" });
    expect(ownership).toEqual({ label: "user" });
  });

  it("writes when the current owner ranks at or below as_tier, stamping the new owner", () => {
    const attributes: Record<string, unknown> = { description: "raw-desc" };
    const ownership: Record<string, Tier> = { description: "raw" };
    const result = apply_field_ladder(attributes, ownership, { description: "agentic-desc" }, "agentic");
    expect(result).toEqual({ written: ["description"], skipped: [] });
    expect(attributes.description).toBe("agentic-desc");
    expect(ownership.description).toBe("agentic");
  });

  it("writes at the equal-rank boundary (agentic over agentic)", () => {
    const attributes: Record<string, unknown> = { note: "a" };
    const ownership: Record<string, Tier> = { note: "agentic" };
    const result = apply_field_ladder(attributes, ownership, { note: "b" }, "agentic");
    expect(result).toEqual({ written: ["note"], skipped: [] });
    expect(attributes.note).toBe("b");
    expect(ownership.note).toBe("agentic");
  });

  it("skips a field a higher tier owns, leaving value and owner untouched", () => {
    const attributes: Record<string, unknown> = { label: "user-val" };
    const ownership: Record<string, Tier> = { label: "user" };
    const result = apply_field_ladder(attributes, ownership, { label: "raw-val" }, "raw");
    expect(result).toEqual({ written: [], skipped: ["label"] });
    expect(attributes.label).toBe("user-val");
    expect(ownership.label).toBe("user");
  });

  it("partitions a mixed batch into written and skipped", () => {
    const attributes: Record<string, unknown> = { label: "user-val", description: "raw-desc" };
    const ownership: Record<string, Tier> = { label: "user", description: "raw" };
    const result = apply_field_ladder(
      attributes,
      ownership,
      { label: "agentic-label", description: "agentic-desc", note: "new" },
      "agentic",
    );
    expect(new Set(result.written)).toEqual(new Set(["description", "note"]));
    expect(result.skipped).toEqual(["label"]);
    expect(attributes).toEqual({ label: "user-val", description: "agentic-desc", note: "new" });
    expect(ownership).toEqual({ label: "user", description: "agentic", note: "agentic" });
  });
});
