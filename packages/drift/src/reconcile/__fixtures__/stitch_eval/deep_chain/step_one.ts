import { lookup_step } from "./chain_registry";

export function start_chain(): number {
  const next = lookup_step("stage_two");
  return next();
}
