---
id: TASK-27.1.6.7
title: "Eval harness for agentic entrypoint stitching: mini-codebase fixtures"
status: To Do
assignee: []
created_date: "2026-06-10 15:52"
updated_date: "2026-06-12 09:40"
labels:
  - agentic
  - eval
  - testing
  - fixtures
  - stitch
dependencies:
  - TASK-27.1.6.6
references:
  - >-
    backlog/tasks/task-27.1.6.6 -
    Agentic-entrypoint-stitching-reconnect-the-call-graphs-Ariadnes-syntactic-analysis-leaves-split.skill-orchestrated-reconcile.plan.html
parent_task_id: TASK-27.1.6
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

## Motivation

task-27.1.6.6 makes the `drift-sync` skill orchestrate two agent judgements over three thin `drift-reconcile` modes (`--list-entrypoints`, `--apply-stitch`, `--apply-descriptions`): the agent sees Ariadne's entrypoints, explores the codebase, and decides which orphan entrypoints to stitch into one flow, then writes short member descriptions. Ariadne's failure set is **open-ended** — registry lookups and callbacks record an unresolved call site, while other misses (interface-typed method calls, calls to names Ariadne never indexes) record *no call site at all*, leaving the orphan entrypoint as the only signal — so the skill instructs the agent to search generically from both ends of the missing edge (grep the called name from a site; grep the orphan's own name when there is no site). The deterministic plumbing (enumeration, bridge writing, hydration) is unit-testable, but the part that actually needs measuring is the agent's **semantic judgement** — does it correctly recognise which fragments belong to one functionality across *different* failure shapes, including the evidence-less ones, and does it decline to merge genuinely independent ones?

That judgement is authored in prose (`SKILL.md` + the `drift-reconciler` instructions) and can only be improved by **running the real agent and observing it**. This task builds that feedback loop: small, committed mini-codebases the agent processes end-to-end via `claude -p` (or the Agents SDK), producing a scored report you iterate against. Without it, every prompt change is a guess.

**The approach: mini-codebase fixtures.** Write small sets of TypeScript files (≤ 100 lines per fixture) that express specific patterns Ariadne splits into multiple entrypoints. Run Ariadne on them to obtain a real call graph with real unresolved call sites, so the agent reasons over genuine source — not synthetic graph metadata.

## Fixture patterns to cover

Each fixture is a subdirectory under `packages/drift/src/reconcile/__fixtures__/stitch_eval/`:

1. **`registry_dispatch/`** — a central `dispatch(key)` that looks up handlers by string key (`handlers[key]()`); two or three files each register a handler. Ariadne cannot resolve `handlers[key]`, so each handler becomes its own orphan entrypoint. **Expected:** the agent stitches all handlers + the dispatcher into one umbrella.
2. **`callback_wiring/`** — a scheduler that accepts a `run: () => void` and invokes it; two callers each pass a different function. The `run()` invocation is unresolved. **Expected:** the agent recognises the callback contract and stitches the callers with the scheduler.
3. **`interface_method/`** — a coordinator that calls `target.run(key)` through an interface-typed value; the concrete implementation lives in another file. Ariadne records **no call reference at all** for the method call, so the implementation's functions surface as orphans with **empty `unresolved_sites`** — the evidence-less class. **Expected:** the agent finds the connection by grepping the orphan's name (the implementation/registration), and stitches a **seeds-only umbrella (no bridge)** — there is no recorded call site to cite, and the bin rejects uncorroborated bridges.
4. **`barrel_reexport/`** — the caller imports through a barrel (`index.ts` re-export chain) that Ariadne fails to follow, splitting caller and callee. Whether this shape records an unresolved site is discovered when the fixture is authored — assert whichever signal Ariadne actually emits, and keep the fixture as a regression pin on that behaviour.
5. **`unrelated_pair/`** — two genuinely independent entrypoints in the same neighbourhood (different domains, no shared call sites). **Expected:** the agent declines to stitch (false-positive guard).

The four positive patterns deliberately span the signal spectrum — site-recorded (`registry_dispatch`, `callback_wiring`), evidence-less (`interface_method`), and to-be-discovered (`barrel_reexport`) — so prompt tuning is measured against the open failure set, not one taxonomy entry.

## Two evaluation tiers

**Tier 1 — structural/replay (jest, deterministic, runs in CI, no model).** `reconcile_stitch_eval.test.ts`, colocated in `packages/drift/src/reconcile/`, runs each fixture through the three bin modes with no agent in the loop:

- `--list-entrypoints` over `registry_dispatch/` and `callback_wiring/` returns a non-empty orphan inventory with non-empty `unresolved_sites` (the fragmentation signal is present); `unrelated_pair/` returns its two entrypoints with no shared unresolved link.
- `--apply-stitch` fed a **golden** `umbrellas` JSON produces one multi-seed umbrella (`seeds.length ≥ 2`) whose `agentic.bridge` endpoints resolve to real call-site spans; fed no umbrellas, the orphans stay singleton flows.
- `--apply-descriptions` fed a golden `descriptions` JSON persists them on the right `symbol_path`s.

These guard the deterministic contract the live agent depends on.

**Tier 2 — live judgement (the real feedback loop).** A runnable harness (`stitch_eval` script, not a default-CI jest test) drives the **actual** agentic flow per fixture via `claude -p` (or the Agents SDK): it sets up a throwaway repo + graph store from the fixture, runs the real `drift-sync` skill / `drift-reconciler` sub-agent so the agent itself calls `--list-entrypoints`, judges, writes `stitch.json`/`descriptions.json`, and calls `--apply-stitch`/`--apply-descriptions`. The harness then inspects the resulting store and scores:

- `registry_dispatch/` and `callback_wiring/` → exactly one multi-seed umbrella spanning the fragments, with ≥ 1 `agentic.bridge` over a corroborated call site;
- `interface_method/` → one multi-seed umbrella with **zero bridges required** (seeds-only — no recorded site exists to corroborate);
- `barrel_reexport/` → one multi-seed umbrella; bridge expectation pinned to whatever signal the fixture is found to emit;
- `unrelated_pair/` → two singleton flows (no merge);
- each member has a non-placeholder description.

It emits a readable report — per fixture: pass/fail, the agent's chosen umbrellas, its rationale, and the descriptions — so a `SKILL.md`/prompt change can be re-scored in one command. This tier is gated behind an env flag / API key and is **not** run in normal CI (it costs tokens and needs a key), but it is built and runnable in this task — it is the point of the task.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 Five fixture directories exist under `packages/drift/src/reconcile/__fixtures__/stitch_eval/`: `registry_dispatch/`, `callback_wiring/`, `interface_method/`, `barrel_reexport/`, `unrelated_pair/`. Each is a set of TypeScript files totalling ≤ 100 lines expressing its named pattern; together the positives span site-recorded and evidence-less Ariadne failure shapes.
- [ ] #2 The fragmentation signal of each positive fixture is asserted via `--list-entrypoints`: `registry_dispatch/` and `callback_wiring/` return a non-empty `unresolved_sites` list; `interface_method/` returns its implementation as an orphan with an **empty** `unresolved_sites` list (the evidence-less signal is orphan-ness alone); `barrel_reexport/` pins whichever signal Ariadne emits for it.
- [ ] #3 **Tier 1 (jest, deterministic):** `reconcile_stitch_eval.test.ts` runs the three bin modes over each fixture and asserts structural/replay properties — `--list-entrypoints` inventory well-formed; golden `--apply-stitch` yields a multi-seed umbrella whose bridge endpoints resolve to real spans; no-umbrella input yields singletons; golden `--apply-descriptions` persists on the right symbol_paths. No model call; runs in CI.
- [ ] #4 **Tier 2 (live feedback loop):** a runnable harness drives the real `drift-sync` skill / `drift-reconciler` sub-agent against each fixture via `claude -p` or the Agents SDK, captures the agent's `stitch.json`/`descriptions.json`, applies them through the bin, and inspects the resulting store. It is gated behind an env flag / API key and excluded from default CI.
- [ ] #5 **Semantic scoring:** the Tier 2 harness scores each positive fixture as one multi-seed umbrella (`seeds.length ≥ 2`) — with ≥ 1 corroborated `agentic.bridge` where the fixture records a call site, and seeds-only (no bridge) accepted for `interface_method/` — and `unrelated_pair/` as two singleton flows (false-positive guard), and reports each member's description.
- [ ] #6 **Iteration ergonomics:** the harness emits a readable per-fixture report (pass/fail, chosen umbrellas, agent rationale, descriptions) and is re-runnable in one command after a `SKILL.md`/prompt edit, so the agentic processing can be tuned against real feedback.
- [ ] #7 Each test/harness block documents which property it guards (structural vs semantic, positive vs negative) via a short inline comment.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Author the five fixtures** under `__fixtures__/stitch_eval/` — minimal real TS that makes Ariadne fragment with a recorded site (`registry_dispatch`, `callback_wiring`), fragment with no recorded site (`interface_method`), fragment via re-export indirection (`barrel_reexport`), or correctly keep separate (`unrelated_pair`). Verify each fixture's actual Ariadne signal empirically with `--list-entrypoints` before writing assertions.
2. **Tier 1 test** (`reconcile_stitch_eval.test.ts`): build each fixture's call graph, exercise `--list-entrypoints` / `--apply-stitch` (golden JSON) / `--apply-descriptions` (golden JSON), assert the structural + replay properties. Reuse the same golden-JSON boundary as task-27.1.6.6's rewritten `reconcile_stitch.test.ts`.
3. **Tier 2 harness** (`stitch_eval` script): per fixture, scaffold a temp repo + graph store, stage the fixture files as the pending-reconcile set, invoke the real flow via `claude -p`/Agents SDK, let the agent drive the three modes, then read the store and score against ground truth. Gate behind `STITCH_EVAL_LIVE=1` (+ API key).
4. **Report + re-run loop**: emit a readable report and make the harness a single-command re-run, so `SKILL.md`/prompt iterations are measurable.
5. **Decide `claude -p` vs Agents SDK** by which most faithfully reproduces the production `drift-reconciler` sub-agent run; document the choice inline.
<!-- SECTION:PLAN:END -->
