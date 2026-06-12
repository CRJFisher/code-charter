import { run_scheduled } from "./scheduler";

function start_services(): void {
  console.log("services started");
}

export function boot(): void {
  run_scheduled(start_services);
}
