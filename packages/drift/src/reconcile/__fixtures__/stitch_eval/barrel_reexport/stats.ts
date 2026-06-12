// The implementation the barrel re-exports; report.ts reaches it only through index.ts.
export function compute_average(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}
