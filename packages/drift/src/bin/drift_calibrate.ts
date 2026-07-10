#!/usr/bin/env node
/**
 * Judge calibration (docs/contracts/judge_calibration.md): join a human grades JSONL and a judge
 * verdicts JSONL on run_id and report raw agreement — the number the .13 gate reads before
 * trusting any description-quality judge, re-checked whenever the judge's model or prompt
 * changes.
 *
 * Deliberately standalone: node builtins only, zero drift imports, reading ONLY the generic keys
 * (run_id, verdict) both contracts pin at the top level. That constraint (decision-10 rule 4) is
 * what lets this tool lift to a shared home untouched — it must not be "fixed" by importing the
 * drift grade reader.
 */

import * as fs from "node:fs";

const USAGE = "usage: drift-calibrate <human_grades.jsonl> <judge_verdicts.jsonl> [--json]";

const SCHEMA_VERSION = 1;
const VERDICTS = new Set(["good", "bad", "mixed"]);

/** Last-wins per run_id; torn and foreign lines are skipped, mirroring both source contracts. */
function read_verdicts(file_path: string): Map<string, string> {
  const verdicts = new Map<string, string>();
  let raw: string;
  try {
    raw = fs.readFileSync(file_path, "utf8");
  } catch (error: unknown) {
    process.stderr.write(`drift-calibrate: cannot read ${file_path}: ${String(error)}\n`);
    process.exit(1);
  }
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const record = parsed as Record<string, unknown>;
    if (record.schema_version !== SCHEMA_VERSION) continue;
    if (typeof record.run_id !== "string" || typeof record.verdict !== "string") continue;
    if (!VERDICTS.has(record.verdict)) continue;
    verdicts.set(record.run_id, record.verdict);
  }
  return verdicts;
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const paths = argv.filter((token) => token !== "--json");
  if (paths.length !== 2) {
    process.stderr.write(`drift-calibrate: expected exactly two JSONL paths\n${USAGE}\n`);
    process.exit(2);
  }
  const human = read_verdicts(paths[0]);
  const judge = read_verdicts(paths[1]);

  const confusion: Record<string, number> = {};
  let joined = 0;
  let agreements = 0;
  const human_only: string[] = [];
  for (const [run_id, human_verdict] of human) {
    const judge_verdict = judge.get(run_id);
    if (judge_verdict === undefined) {
      human_only.push(run_id);
      continue;
    }
    joined++;
    if (human_verdict === judge_verdict) agreements++;
    const key = `${human_verdict}->${judge_verdict}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }
  const judge_only = [...judge.keys()].filter((run_id) => !human.has(run_id));

  const report = {
    human_total: human.size,
    judge_total: judge.size,
    joined,
    agreements,
    raw_agreement: joined === 0 ? null : agreements / joined,
    confusion,
    human_only,
    judge_only,
  };

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  const pct = report.raw_agreement === null ? "n/a" : `${(report.raw_agreement * 100).toFixed(1)}%`;
  process.stdout.write(`agreement: ${agreements}/${joined} (${pct})\n`);
  for (const [key, count] of Object.entries(confusion).sort()) {
    process.stdout.write(`  ${key}: ${count}\n`);
  }
  if (human_only.length > 0) process.stdout.write(`human-only (no judge verdict): ${human_only.length}\n`);
  if (judge_only.length > 0) process.stdout.write(`judge-only (no human grade): ${judge_only.length}\n`);
}

main();
