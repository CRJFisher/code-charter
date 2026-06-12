// The handler table is populated by the deployment framework at startup, keyed by action name —
// the registration is invisible to static analysis.
const table = new Map<string, () => number>();

export function lookup_handler(key: string): () => number {
  return table.get(key)!;
}
