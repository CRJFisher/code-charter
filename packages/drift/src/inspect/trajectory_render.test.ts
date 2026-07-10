import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";

import { SPINE_SCHEMA_VERSION, type TrajectorySpine } from "./trajectory_schema";
import { render_trajectory } from "./trajectory_render";

// Built from the neutral schema alone — this test file importing zero drift modules is part of
// the AC#4 proof that rendering needs no drift knowledge.
function spine(over: Partial<TrajectorySpine> = {}): TrajectorySpine {
  return {
    schema_version: SPINE_SCHEMA_VERSION,
    run_id: "20260710T120000000Z-aabbccdd",
    session_id: "s1",
    timestamp: "2026-07-10T12:00:30.000Z",
    transcript_available: true,
    availability_note: "",
    steps: [
      { kind: "instruction", ordinal: 0, at: null, summary: "Launch the reconciler.", detail: {} },
      { kind: "context", ordinal: 1, at: "2026-07-10T12:00:10.000Z", summary: "Read src/a.ts", detail: {} },
      { kind: "judgement", ordinal: 2, at: null, summary: "bridge a -> b: linked", detail: {} },
      { kind: "effect", ordinal: 3, at: null, summary: "hydrate f (code, 2 member(s)): new", detail: {} },
    ],
    detail: { mode: "default", notes: [] },
    ...over,
  };
}

describe("render_trajectory", () => {
  it("renders the four sections in canonical order with their step summaries", () => {
    const lines = render_trajectory(spine());
    const text = lines.join("\n");
    const order = [
      text.indexOf("instruction (1):"),
      text.indexOf("context (1):"),
      text.indexOf("judgement (1):"),
      text.indexOf("effect (1):"),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("  Launch the reconciler.");
    expect(text).toContain("  Read src/a.ts");
  });

  it("prints the availability note verbatim for an effect-only view", () => {
    const lines = render_trajectory(
      spine({
        transcript_available: false,
        availability_note: "transcript unavailable: t.jsonl missing (rotated?)",
        steps: [{ kind: "effect", ordinal: 0, at: null, summary: "hydrate f", detail: {} }],
      }),
    );
    const text = lines.join("\n");
    expect(text).toContain("transcript unavailable: t.jsonl missing (rotated?) — effect-only view");
    expect(text).toContain("effect (1):");
  });

  it("orders steps by ordinal, not input order", () => {
    const lines = render_trajectory(
      spine({
        steps: [
          { kind: "context", ordinal: 2, at: null, summary: "second", detail: {} },
          { kind: "context", ordinal: 1, at: null, summary: "first", detail: {} },
        ],
      }),
    );
    const text = lines.join("\n");
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });
});

describe("the extraction/rendering boundary (docs/contracts/trajectory_spine.md)", () => {
  it("the renderer imports only the neutral schema module", () => {
    const source = fs.readFileSync(path.join(__dirname, "trajectory_render.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./trajectory_schema"]);
    // The `from` scan misses require() and dynamic import(); rule those out too.
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it("the neutral schema module imports nothing", () => {
    const source = fs.readFileSync(path.join(__dirname, "trajectory_schema.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import /m);
  });

  it("the pinned contract doc names exactly the four step kinds the schema declares", () => {
    const doc = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "docs", "contracts", "trajectory_spine.md"),
      "utf8",
    );
    expect(doc).toContain('"instruction" \\| "context" \\| "judgement" \\| "effect"');
    expect(doc).toMatch(/^contract_version: 1$/m);
  });
});
