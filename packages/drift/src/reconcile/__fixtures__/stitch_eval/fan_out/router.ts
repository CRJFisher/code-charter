import { lookup_route } from "./fan_registry";

export function route(key: string): number {
  const fn = lookup_route(key);
  return fn();
}
