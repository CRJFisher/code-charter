/**
 * The prompt assets whose prose IS the agent's stitching judgement, and the one hashing rule
 * every surface shares: the stitch_eval report header, the committed pin file, and the CI guard
 * all speak this module's 12-hex fingerprint, so they can never drift from each other. Lives
 * outside the stitch_eval bin because that bin runs main() on import — the CI guard must import
 * hashing without executing an eval.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");

/** Repo-relative (to packages/drift) paths of the pinned prompt assets. */
export const PROMPT_ASSET_PATHS: readonly string[] = [
  "assets/skills/drift-sync/SKILL.md",
  "assets/agents/drift-reconciler.md",
];

export const PROMPT_ASSET_PIN_FILE = "assets/prompt_asset_pins.json";

/** The 12-hex fingerprint the report header has always printed — the single truncation rule. */
export function prompt_hash(asset_path: string): string {
  const abs = path.join(PACKAGE_ROOT, asset_path);
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 12);
}

export function compute_pins(): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const asset_path of PROMPT_ASSET_PATHS) pins[asset_path] = prompt_hash(asset_path);
  return pins;
}

/**
 * A missing or corrupt pin file reads as the empty map, so the guard reports every asset as
 * "(unpinned)" through the curated directive instead of dying on a raw ENOENT/SyntaxError.
 */
export function read_pins(): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(PACKAGE_ROOT, PROMPT_ASSET_PIN_FILE), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, string>;
  } catch {
    // fall through to the empty map
  }
  return {};
}

export function write_pins(): void {
  fs.writeFileSync(
    path.join(PACKAGE_ROOT, PROMPT_ASSET_PIN_FILE),
    JSON.stringify(compute_pins(), null, 2) + "\n",
  );
}

export interface PinDrift {
  asset_path: string;
  pinned: string;
  actual: string;
}

/** Every asset whose current hash differs from its pin; `compute` is injectable for the guard's own test. */
export function check_pins(
  pinned: Record<string, string>,
  compute: (asset_path: string) => string = prompt_hash,
): PinDrift[] {
  const drifted: PinDrift[] = [];
  for (const asset_path of PROMPT_ASSET_PATHS) {
    let actual: string;
    try {
      actual = compute(asset_path);
    } catch {
      actual = "(missing asset)";
    }
    const pin = pinned[asset_path];
    if (pin !== actual) drifted.push({ asset_path, pinned: pin ?? "(unpinned)", actual });
  }
  return drifted;
}

/**
 * The actionable failure the CI guard throws: it must hand the reader the re-certification loop
 * and the new hashes verbatim, or the path of least resistance becomes a blind pin bump.
 */
export function pin_drift_message(drifted: readonly PinDrift[]): string {
  const lines = drifted.map((d) => `  ${d.asset_path}: pinned ${d.pinned}, now ${d.actual}`);
  return [
    "prompt asset drift — the stitching prompts changed since they were last pinned:",
    ...lines,
    "",
    "CI cannot measure prose quality; only the Tier-2 live eval does. Run the haiku gate (and, for a",
    "substantive prompt change, a deliberate production-representative certification with",
    "STITCH_EVAL_MODEL), then refresh the pin:",
    "  cd packages/drift && npm run build && STITCH_EVAL_LIVE=1 npm run stitch_eval",
    "  npm run stitch_eval:pin   # rewrites assets/prompt_asset_pins.json — commit it with the prompt change",
  ].join("\n");
}
