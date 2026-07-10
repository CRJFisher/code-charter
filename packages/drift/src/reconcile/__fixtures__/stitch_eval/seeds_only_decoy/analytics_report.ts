// Deliberately parallel to billing_report.ts — same verb shape, same structure, no relationship.
function format_analytics_rows(rows: readonly number[]): string {
  return rows.map((row) => `analytics:${row}`).join("\n");
}

export function export_analytics_report(rows: readonly number[]): string {
  return format_analytics_rows(rows);
}
