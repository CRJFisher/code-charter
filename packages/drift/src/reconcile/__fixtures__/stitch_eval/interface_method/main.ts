import { csv_exporter } from "./csv_exporter";
import { run_export } from "./exporter";

export function export_report(count: number): number {
  return run_export(csv_exporter, count);
}
