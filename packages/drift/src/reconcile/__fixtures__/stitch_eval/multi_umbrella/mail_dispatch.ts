import { lookup_mail_handler } from "./mail_registry";

export function dispatch_mail(key: string): number {
  const fn = lookup_mail_handler(key);
  return fn();
}
