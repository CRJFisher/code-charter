---
id: TASK-27.1.6.7
title: "Eval harness for agentic entrypoint stitching: mini-codebase fixtures"
status: Done
assignee: []
created_date: "2026-06-10 15:52"
updated_date: "2026-06-12 13:20"
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

**The approach: mini-codebase fixtures.** Write small sets of source files (TypeScript or Python, ≤ 100 lines per fixture) that each express one specific Ariadne resolution weakness — a pattern Ariadne splits into multiple entrypoints. Run Ariadne on them to obtain a real call graph with real unresolved call sites, so the agent reasons over genuine source — not synthetic graph metadata.

## Fixture patterns to cover

Each fixture is a subdirectory under `packages/drift/src/reconcile/__fixtures__/stitch_eval/`, **named by the Ariadne resolution weakness it contains**. Each directory carries a short manifest comment stating the weakness, why Ariadne fragments there, and the expected agent behaviour — so the suite reads as a weakness taxonomy that grows naturally as new categories are found.

1. **`dynamic_key_dispatch/`** (TypeScript) — a central `dispatch(key)` that fetches a handler from a string-keyed registry (`lookup_handler(key)` over a `Map`) and invokes the result (`fn()`); handler files declare `handle_<key>` functions whose registration happens out of band (framework/config at startup — deliberately invisible to static analysis, since in-code registration lets Ariadne track the reference and nothing fragments). Ariadne cannot resolve `fn()`, so the dispatcher and each handler become their own orphan entrypoints. **Expected:** the agent stitches all handlers + the dispatcher into one umbrella.
2. **`untyped_callback_invocation/`** (TypeScript) — a scheduler that accepts a `run: () => void` and invokes it; two callers each pass a different function. The `run()` invocation is unresolved. **Expected:** the agent recognises the callback contract and stitches the callers with the scheduler.
3. **`untyped_receiver_method/`** (Python) — a function calls a method on a parameter that carries no type annotation (`item.process()`); the caller instantiates the class (defined in another file) and passes the instance in. Ariadne emits no call node at all for the untyped `item.process()`, so the method becomes its own orphan entrypoint and the corroborable bridge site is the `run_item(Item())` line in the caller's tree. **Expected:** the agent stitches the caller, the untyped function, and the method into one umbrella.
4. **`interface_method/`** (TypeScript, planned) — a coordinator calls `target.run(key)` through an interface-typed value; the concrete implementation lives in another file. Ariadne records **no call reference at all**, so the implementation's functions surface as orphans with **empty `unresolved_sites`** — the evidence-less class. **Expected:** the agent finds the connection by grepping the orphan's name (the implementation/registration) and stitches a **seeds-only umbrella (no bridge)** — there is no recorded call site to cite, and the bin rejects uncorroborated bridges.
5. **`barrel_reexport/`** (TypeScript, planned) — the caller imports through a barrel (`index.ts` re-export chain) that Ariadne fails to follow, splitting caller and callee. Whether this shape records an unresolved site is discovered when the fixture is authored — assert whichever signal Ariadne actually emits, and keep the fixture as a regression pin on that behaviour.
6. **`control_unrelated_pair/`** (TypeScript) — two genuinely independent entrypoints in the same neighbourhood (different domains, no shared call sites); the control case containing no weakness. **Expected:** the agent declines to stitch (false-positive guard).

The positive patterns deliberately span the signal spectrum — site-recorded (`dynamic_key_dispatch`, `untyped_callback_invocation`, `untyped_receiver_method`), evidence-less (`interface_method`), and to-be-discovered (`barrel_reexport`) — so prompt tuning is measured against the open failure set, not one taxonomy entry.

## Two evaluation tiers

**Tier 1 — structural/replay (jest, deterministic, runs in CI, no model).** `reconcile_stitch_eval.test.ts`, colocated in `packages/drift/src/reconcile/`, runs each fixture through the three bin modes with no agent in the loop:

- `--list-entrypoints` over `dynamic_key_dispatch/`, `untyped_callback_invocation/`, and `untyped_receiver_method/` returns a non-empty orphan inventory with non-empty `unresolved_sites` (the fragmentation signal is present); `interface_method/` returns its implementation as an orphan with an **empty** `unresolved_sites` list (the evidence-less signal is orphan-ness alone); `barrel_reexport/` pins whichever signal Ariadne emits for it; `control_unrelated_pair/` returns its two entrypoints with no shared unresolved link.
- `--apply-stitch` fed a **golden** `umbrellas` JSON produces one multi-seed umbrella (`seeds.length ≥ 2`) whose `agentic.bridge` endpoints resolve to real call-site spans; fed no umbrellas, the orphans stay singleton flows.
- `--apply-descriptions` fed a golden `descriptions` JSON persists them on the right `symbol_path`s.

These guard the deterministic contract the live agent depends on.

**Tier 2 — live judgement (the real feedback loop).** A runnable harness (`stitch_eval` script, not a default-CI jest test) drives the **actual** agentic flow per fixture via `claude -p` (or the Agents SDK): it sets up a throwaway repo + graph store from the fixture, runs the real `drift-sync` skill / `drift-reconciler` sub-agent so the agent itself calls `--list-entrypoints`, judges, writes `stitch.json`/`descriptions.json`, and calls `--apply-stitch`/`--apply-descriptions`. The harness then inspects the resulting store and scores:

- `dynamic_key_dispatch/`, `untyped_callback_invocation/`, and `untyped_receiver_method/` → exactly one multi-seed umbrella spanning the fragments, with ≥ 1 `agentic.bridge` over a corroborated call site;
- `interface_method/` → one multi-seed umbrella with **zero bridges required** (seeds-only — no recorded site exists to corroborate);
- `barrel_reexport/` → one multi-seed umbrella; bridge expectation pinned to whatever signal the fixture is found to emit;
- `control_unrelated_pair/` → two singleton flows (no merge);
- each member has a non-placeholder description.

It emits a readable report — per fixture: pass/fail, the agent's chosen umbrellas, its rationale, and the descriptions — so a `SKILL.md`/prompt change can be re-scored in one command. This tier is gated behind an env flag / API key and is **not** run in normal CI (it costs tokens and needs a key), but it is built and runnable in this task — it is the point of the task.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [x] #1 Four fixture directories exist under `packages/drift/src/reconcile/__fixtures__/stitch_eval/`, each named by the Ariadne resolution weakness it contains: `dynamic_key_dispatch/`, `untyped_callback_invocation/`, `untyped_receiver_method/` (Python), `control_unrelated_pair/`. Each is a set of source files totalling ≤ 100 lines expressing its named weakness, with a manifest comment stating the weakness and the expected agent behaviour.
- [x] #2 `dynamic_key_dispatch/`, `untyped_callback_invocation/`, and `untyped_receiver_method/` each produce at least one unresolved call site when parsed by Ariadne — asserted via `--list-entrypoints` returning a non-empty `unresolved_sites` list for each.
- [x] #3 **Tier 1 (jest, deterministic):** `reconcile_stitch_eval.test.ts` runs the three bin modes over each fixture and asserts structural/replay properties — `--list-entrypoints` inventory well-formed; golden `--apply-stitch` yields a multi-seed umbrella whose bridge endpoints resolve to real spans; no-umbrella input yields singletons; golden `--apply-descriptions` persists on the right symbol_paths. No model call; runs in CI.
- [x] #4 **Tier 2 (live feedback loop):** a runnable harness drives the real `drift-sync` skill / `drift-reconciler` sub-agent against each fixture via `claude -p` or the Agents SDK, captures the agent's `stitch.json`/`descriptions.json`, applies them through the bin, and inspects the resulting store. It is gated behind an env flag / API key and excluded from default CI.
- [x] #5 **Semantic scoring:** the Tier 2 harness scores `dynamic_key_dispatch/`, `untyped_callback_invocation/`, and `untyped_receiver_method/` as one multi-seed umbrella (`seeds.length ≥ 2`) with ≥ 1 `agentic.bridge`, and `control_unrelated_pair/` as two singleton flows (false-positive guard), and reports each member's description.
- [x] #6 **Iteration ergonomics:** the harness emits a readable per-fixture report (pass/fail, chosen umbrellas, agent rationale, descriptions) and is re-runnable in one command after a `SKILL.md`/prompt edit, so the agentic processing can be tuned against real feedback.
- [x] #7 Each test/harness block documents which property it guards (structural vs semantic, positive vs negative) via a short inline comment.
- [x] #8 **`interface_method/` fixture (evidence-less class):** a coordinator calls `target.run(key)` through an interface-typed value with the implementation in another file; Tier 1 pins the orphan-with-empty-`unresolved_sites` signal, and Tier 2 scores one multi-seed umbrella with zero bridges required (seeds-only — the harness gains a seeds-only expectation kind). Verify the fragmentation empirically with `--list-entrypoints` before writing assertions.
- [x] #9 **`barrel_reexport/` fixture (to-be-discovered class):** the caller imports through an `index.ts` re-export chain Ariadne fails to follow; the actual signal is discovered when the fixture is authored and pinned in both tiers as a regression guard.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. **Author the four fixtures** under `__fixtures__/stitch_eval/`, named by contained weakness — minimal real source that makes Ariadne fragment (`dynamic_key_dispatch`, `untyped_callback_invocation`, `untyped_receiver_method`) or correctly keep separate (`control_unrelated_pair`).
2. **Tier 1 test** (`reconcile_stitch_eval.test.ts`): build each fixture's call graph, exercise `--list-entrypoints` / `--apply-stitch` (golden JSON) / `--apply-descriptions` (golden JSON), assert the structural + replay properties. Reuse the same golden-JSON boundary as task-27.1.6.6's rewritten `reconcile_stitch.test.ts`.
3. **Tier 2 harness** (`stitch_eval` script): per fixture, scaffold a temp repo + graph store, stage the fixture files as the pending-reconcile set, invoke the real flow via `claude -p`/Agents SDK, let the agent drive the three modes, then read the store and score against ground truth. Gate behind `STITCH_EVAL_LIVE=1` (+ API key).
4. **Report + re-run loop**: emit a readable report and make the harness a single-command re-run, so `SKILL.md`/prompt iterations are measurable.
5. **Decide `claude -p` vs Agents SDK** by which most faithfully reproduces the production `drift-reconciler` sub-agent run; document the choice inline.
6. **Extend the taxonomy across the open failure set** (AC #8–#9): author `interface_method/` and `barrel_reexport/`, spike each with `--list-entrypoints` to pin its real signal, add Tier 1 goldens, and teach the Tier 2 harness a seeds-only expectation kind for evidence-less stitches.
<!-- SECTION:PLAN:END -->

## Implementation Notes

## High-level summary

The agent's stitching judgement lives in prose (`assets/skills/drift-sync/SKILL.md`, `assets/agents/drift-reconciler.md`) and can only be tuned against observation; this harness makes a prompt edit measurable in one command. Six mini-codebase fixtures under `packages/drift/src/reconcile/__fixtures__/stitch_eval/`, each named by the Ariadne resolution weakness it contains, give the agent real fragmented call graphs to judge — three site-recorded weaknesses that must stitch with a bridge, two evidence-less weaknesses that must stitch seeds-only, and one control that must not stitch.

Every fixture shape is empirically pinned: the bin's `--list-entrypoints` is run over each candidate before any golden JSON is written, because Ariadne resolves more than intuition suggests. In-code handler registration lets Ariadne track the function reference and nothing fragments — so `dynamic_key_dispatch` keeps its registration out of band. Python emits no call node at all for a method call on an unannotated receiver — so the corroborable bridge site in `untyped_receiver_method` is the caller's `run_item(Item())` line, not `item.process()` itself.

Tier 1 (`src/reconcile/reconcile_stitch_eval.test.ts`, CI) spawns the built `drift-reconcile` bin per fixture over a tmp copy and replays golden stitch/description JSON through the three agentic modes — per-process Ariadne isolation and the full CLI contract for free. Tier 2 (`src/bin/stitch_eval.ts`, `STITCH_EVAL_LIVE=1 npm run stitch_eval [fixture]`) scaffolds a throwaway repo per fixture, installs the production `.claude` bundle via `install_drift` (an `assets/` prose edit reaches the next run with no copying), stages the pending set, and drives the real `drift-reconciler` via `claude -p` with the Stop hook's verbatim instruction (haiku by default; `STITCH_EVAL_MODEL` overrides). It scores the resulting store and writes a per-fixture report to `.stitch_eval_runs/`. `claude -p` is the executor rather than the Agents SDK because print mode loads the exact installed prose under measurement. The full six-fixture suite scores 6/6 PASS on haiku — every weakness class stitched (bridged or seeds-only as its signal dictates) and the control declined.

Building the Python fixture surfaced a real product seam: `apply_descriptions` looked anchors up by resolver `symbol_path`, so a stitched method member's description — submitted under its flow-layer path (`file#process:method`) — silently skipped, the anchor space being enclosing-qualified (`file#Item.process:method`). It now resolves wire paths through the graph index to anchors by `symbol_id`, the same two-id-space join hydration uses, and persists under the rename-stable anchor path; the method's cache-skip and revision branches are guarded in Tier 1.

Sharp edges: flow-layer symbol_paths drop the enclosing scope, so two same-named methods in one file collapse to one path — the first-sorted symbol wins the index; a latent, pre-existing ambiguity left for a follow-up. The live tier is excluded from CI by construction (an npm script, never a jest suite) and spends real tokens.

**The evidence-less classes (AC #8–#9)** complete the taxonomy, and both pinned signals diverged from the task's guesses — the empirical spike earning its keep again. `interface_method/`: an explicit `implements Exporter` clause lets Ariadne resolve the interface call and nothing fragments, so the fixture's implementation satisfies the interface structurally (the TS analogue of `dynamic_key_dispatch`'s out-of-band registration); the exporter instance is module-level so no constructor call lands in any entrypoint's tree — the inventory is two orphans with zero `unresolved_sites` anywhere. `barrel_reexport/`: the barrel-routed call records no call node at all (caller orphans, empty sites) and the re-export counts as the implementation's only reference, keeping `compute_average` out of the inventory entirely — it still resolves in the live graph as a seed. Both stitch seeds-only; Tier 1 pins that an uncorroborated bridge claim is rejected while the umbrella still hydrates, and Tier 2 gained the `stitch_seeds_only` expectation kind (multi-seed umbrella required, bridge not).

The fixtures exposed prose gaps that would have failed every evidence-less stitch — the exact feedback loop the harness exists for. `SKILL.md` previously short-circuited when "no entrypoint with unresolved sites" (an evidence-less inventory would never be judged), scoped exploration to grepping the orphan's *name* (which finds nothing for `barrel_reexport` — the connection is a call inside the orphan's *body*), and constrained seeds to inventory symbol_paths (the never-promoted `compute_average` must be seeded from outside the inventory). All three are rewritten: zero recorded sites is named a failure shape, orphan exploration reads the body and follows unrecorded misses to definitions the inventory never lists, and seeds resolve against the live graph in the same `file#name:kind` format wherever they were found.
