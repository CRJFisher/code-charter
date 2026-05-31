/**
 * Host capability gate for the built-in SQLite engine.
 *
 * The engine is available only on Node >= 22.13.0. On older or non-Node hosts the
 * gate returns false and callers fall back to a degraded store rather than crashing.
 */

/** Minimum Node version that ships the built-in SQLite engine. */
export const MIN_NODE_SQLITE_VERSION = "22.13.0";

/** The running host's Node version, or undefined on a non-Node host. */
export function current_node_version(): string | undefined {
  return typeof process !== "undefined" ? process.versions?.node : undefined;
}

/**
 * True when `version` satisfies {@link MIN_NODE_SQLITE_VERSION}. Uses a numeric semver
 * tuple compare — never a lexical/`parseFloat` compare, so "22.9.0" correctly ranks below
 * "22.13.0". An absent version (non-Node host) is unsupported.
 */
export function is_node_sqlite_supported(version: string | undefined): boolean {
  if (!version) return false;
  return compare_versions(version, MIN_NODE_SQLITE_VERSION) >= 0;
}

function compare_versions(a: string, b: string): number {
  const pa = parse_version(a);
  const pb = parse_version(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function parse_version(value: string): [number, number, number] {
  const core = value.replace(/^v/, "").split("-")[0];
  const parts = core.split(".").map((p) => Number.parseInt(p, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
