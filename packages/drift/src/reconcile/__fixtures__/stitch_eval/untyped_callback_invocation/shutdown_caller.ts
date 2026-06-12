import { run_scheduled } from "./scheduler";

function stop_services(): void {
  console.log("services stopped");
}

export function shutdown(): void {
  run_scheduled(stop_services);
}
