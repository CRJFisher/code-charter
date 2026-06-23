import { CONFIG } from "./chart_config";

describe("zoom level invariants", () => {
  // The initial fit-to-view caps its zoom at `initial_max_zoom` so the first frame
  // renders the module-level view. The view switches to function detail at
  // `transform[2] >= threshold` (see ZoomAwareNode / ModuleGroupNode), so the cap must
  // stay strictly below the threshold or small graphs open in function view on load.
  it("keeps the initial fit zoom below the function-detail threshold", () => {
    expect(CONFIG.zoom.levels.initial_max_zoom).toBeLessThan(CONFIG.zoom.levels.threshold);
  });

  it("keeps the initial fit zoom within the allowed zoom range", () => {
    expect(CONFIG.zoom.levels.initial_max_zoom).toBeGreaterThanOrEqual(CONFIG.zoom.levels.min);
    expect(CONFIG.zoom.levels.initial_max_zoom).toBeLessThanOrEqual(CONFIG.zoom.levels.max);
  });
});
