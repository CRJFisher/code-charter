export function clamp_percent(value: number): number {
  return value < 0 ? 0 : value > 100 ? 100 : value;
}
