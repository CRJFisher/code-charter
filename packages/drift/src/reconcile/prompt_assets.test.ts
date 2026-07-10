import { describe, expect, it } from "@jest/globals";

import { check_pins, compute_pins, pin_drift_message, read_pins, PROMPT_ASSET_PATHS } from "./prompt_assets";

describe("prompt-asset pin guard (the CI gate on the stitching prompts)", () => {
  it("the committed pins match the live prompt assets", () => {
    const drifted = check_pins(read_pins());
    if (drifted.length > 0) {
      // A thrown Error carries the full multi-line directive past jest's diff truncation.
      throw new Error(pin_drift_message(drifted));
    }
    expect(drifted).toEqual([]);
  });

  it("reports every asset whose hash drifted — the guard actually trips", () => {
    const pinned = compute_pins();
    const drifted = check_pins(pinned, () => "deadbeef0000");
    expect(drifted).toHaveLength(PROMPT_ASSET_PATHS.length);
    expect(drifted[0].actual).toBe("deadbeef0000");
  });

  it("is silent when every hash agrees", () => {
    expect(check_pins(compute_pins())).toEqual([]);
  });

  it("the drift message names the re-certification loop and the pin file", () => {
    const message = pin_drift_message([{ asset_path: "assets/agents/drift-reconciler.md", pinned: "a", actual: "b" }]);
    expect(message).toContain("STITCH_EVAL_LIVE=1 npm run stitch_eval");
    expect(message).toContain("stitch_eval:pin");
    expect(message).toContain("assets/prompt_asset_pins.json");
    expect(message).toContain("pinned a, now b");
  });
});
