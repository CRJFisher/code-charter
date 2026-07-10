import { lookup_step } from "./chain_registry";

// Wired as "stage_three" by the pipeline runner at startup.
export function stage_three(): number {
  const next = lookup_step("stage_four");
  return next();
}
