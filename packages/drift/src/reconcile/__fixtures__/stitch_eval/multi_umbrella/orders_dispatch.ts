import { lookup_order_handler } from "./order_registry";

export function dispatch_order(key: string): number {
  const fn = lookup_order_handler(key);
  return fn();
}
