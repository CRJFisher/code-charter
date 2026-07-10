import { lookup_step } from "./chain_registry";

// Wired as "stage_two" by the pipeline runner at startup.
export function stage_two(): number {
  const next = lookup_step("stage_three");
  return next();
}
