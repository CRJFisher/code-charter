/**
 * task-27.1.6.3 AC#2 — rank plausible new targets for a stranded re-attachment-bin entry.
 *
 * When a description's symbol is genuinely gone (a `miss`), the user often knows the *right new*
 * symbol but the bin offers no candidates to choose from. This ranks the live anchored symbols as
 * re-attachment targets purely over anchors — no Ariadne, no resolver index, no store — so the
 * caller (the `drift.list` bin query) supplies the live anchors it already read off the store and
 * gets back a deterministic, best-first shortlist a chooser can pick from without a follow-up hunt.
 *
 * The signal hierarchy mirrors the resolver cascade's notion of "same body moved": a content_hash
 * match is the strongest evidence (the body relocated here), then same-file proximity (a rename in
 * place), then a same-name+kind match in another file. The scoring is integer-tiered and ties break
 * on `symbol_path`, so the same inputs always yield byte-identical output.
 */

import type { Anchor } from "@code-charter/types";

import { file_of_symbol_path } from "../model/module_scaffold";

/** A live anchored symbol the stranded content could re-attach to (parsed from a live node's anchor). */
export interface LiveAnchor {
  symbol_path: string;
  content_hash: string;
}

/** Which signal earned a candidate its rank — the dominant one, for a chooser to read at a glance. */
export type CandidateReason = "relocated" | "same-file" | "name-match";

/** One ranked re-attachment target, strongest first. `path` is the target's defining file, for display. */
export interface RankedCandidate {
  symbol_path: string;
  path: string;
  score: number;
  reason: CandidateReason;
}

export interface RankCandidatesOptions {
  /** Top-N cap on returned candidates (default 5) — keeps the listing payload small and the choice tractable. */
  limit?: number;
}

const SCORE_CONTENT_MATCH = 100;
const SCORE_SAME_FILE = 10;
const SCORE_NAME_MATCH = 5;
const DEFAULT_LIMIT = 5;

/**
 * Rank `live` anchors as re-attachment candidates for the `stranded` anchor. Pure and deterministic:
 * scores each by content_hash match (+100), same defining file (+10), and same leaf-name+kind (+5);
 * drops zero-signal anchors and the stranded symbol itself; sorts by score descending then
 * `symbol_path` ascending; and caps at `options.limit ?? 5`.
 */
export function rank_candidates(
  stranded: Anchor,
  live: readonly LiveAnchor[],
  options?: RankCandidatesOptions,
): RankedCandidate[] {
  const stranded_file = file_of_symbol_path(stranded.symbol_path);
  const stranded_name = symbol_name_kind(stranded.symbol_path);

  const ranked: RankedCandidate[] = [];
  for (const candidate of live) {
    if (candidate.symbol_path === stranded.symbol_path) {
      continue;
    }
    const content_match = candidate.content_hash === stranded.content_hash;
    const same_file = file_of_symbol_path(candidate.symbol_path) === stranded_file;
    const candidate_name = symbol_name_kind(candidate.symbol_path);
    const name_match = candidate_name.leaf === stranded_name.leaf && candidate_name.kind === stranded_name.kind;

    const score =
      (content_match ? SCORE_CONTENT_MATCH : 0) +
      (same_file ? SCORE_SAME_FILE : 0) +
      (name_match ? SCORE_NAME_MATCH : 0);
    if (score === 0) {
      continue;
    }
    const reason: CandidateReason = content_match ? "relocated" : same_file ? "same-file" : "name-match";
    ranked.push({ symbol_path: candidate.symbol_path, path: file_of_symbol_path(candidate.symbol_path), score, reason });
  }

  ranked.sort((a, b) => (b.score - a.score) || (a.symbol_path < b.symbol_path ? -1 : a.symbol_path > b.symbol_path ? 1 : 0));
  return ranked.slice(0, options?.limit ?? DEFAULT_LIMIT);
}

/**
 * The leaf name and kind of a `symbol_path` (`<file>#<qualified>:<kind>`). `qualified` joins identifier
 * segments with `.`, the trailing `:<kind>` is a bare word — so the kind is the tail after the last `:`
 * and the leaf is the last `.`-segment of what precedes it.
 */
function symbol_name_kind(symbol_path: string): { leaf: string; kind: string } {
  const hash = symbol_path.indexOf("#");
  const after_file = hash === -1 ? symbol_path : symbol_path.slice(hash + 1);
  const colon = after_file.lastIndexOf(":");
  const qualified = colon === -1 ? after_file : after_file.slice(0, colon);
  const kind = colon === -1 ? "" : after_file.slice(colon + 1);
  const segments = qualified.split(".");
  return { leaf: segments[segments.length - 1], kind };
}
