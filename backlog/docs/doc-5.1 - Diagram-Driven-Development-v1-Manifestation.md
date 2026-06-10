---
id: doc-5.1
title: Diagram-Driven Development — v1 Manifestation (the code-to-diagram half)
type: spec
parent: doc-5
created_date: "2026-06-01 00:00"
---

# Diagram-Driven Development — v1 Manifestation (the code-to-diagram half)

_How doc-5's target functionality is manifested in v1 (task-27.1, the code-to-diagram half). doc-5 is the timeless vision; this doc fixes what v1 includes, what it defers, and why._

## v1 in one sentence

v1 helps you get oriented in a code-tree fast: it surfaces agent-detected **flows** one at a time via a left-panel selector and renders each as its own diagram (the flow boundary already excludes unrelated code — the deterministic-essence baseline; decision-salience, the qualitative "essence", follows as the first add-on, task-27.1.7), and keeps each flow in step as you work. Diagrams are built **lazily and piecemeal** — a flow's diagram is created the first time you work on its code, and only flows you touch are hydrated or re-synced, to minimise token cost. Both first-build and re-sync are driven by the Claude Code `Stop` hook, which launches a custom sub-agent that keeps the work on your radar without derailing your session.

## The v1 unit: the flow

The comprehension unit is a **flow**: the subgraph induced by seed entrypoint roots + agent-inferred bridge edges across those trees + linked docs. The deterministic call-graph fills each tree's interior; the agent judges only the seam. A flow is the **tiling block** of doc-5's whole-repo map, surfaced one-at-a-time first. A left-panel flow selector replaces the entrypoint list. Agentic diagrams are **hydrated lazily** — built on demand the first time a flow's code is worked on — so the selector orders flows by (1) those that already have a diagram, then (2) recency of update; the top-ranked flow with a diagram auto-renders on open, while not-yet-hydrated flows stay browsable via the deterministic skeleton. A **flow hydration / auto-sync custom sub-agent** (task-27.1.6), launched by the main agent from the `Stop` hook, builds and later re-syncs each flow's diagram. The first end-to-end target is a Claude Code skill's flow.

## The organizing seam

Deterministic substrate (objective, free, L0): Ariadne call/import edges, the function-to-file-to-directory scaffold, literal doc/frontmatter edges, entrypoint roots. Agent-detected structure (subjective, goal-dependent, L1 agentic): flow boundary, label, bridge edges, doc attachment, and as the first add-on the salience of key control flow. The **agentic lane** is `layer='agentic'` + a namespaced `kind` (e.g. `agentic.bridge`) + lower `confidence` + `inference_rationale` in the attributes bag — there is no `extractor` field; it renders distinct and is click-through-explained. v1 fixes one detection goal (orienting in a code-tree), keeping task-27.2 and the deferred map additive.

## Per-principle manifestation

### Customisation is agent-mediated at every layer

Included: customisation at the flow and description layers is agent-mediated — the agent authors it and re-applies it on each sync, the way the describe seam regenerates descriptions. Flow-layer and description writes are unconditional agentic upserts that replace `layer` and `field_ownership` wholesale (`write_flow`, `write_descriptions`, via the store's full ON CONFLICT replace), so nothing at these layers is a protected user-tier field and nothing stored there survives a sync except by being re-applied. A relocated symbol's content is re-anchored inline by the resolver (an unchanged body is a content-hash cache hit); a resolver miss soft-deletes, and agentic content is regenerated on a later sync. Human-authored inputs that reach the diagram (docstrings, frontmatter) live in the code and are deterministically re-read each sync. Deferred: pinning (27.1.7) and edit-driven authority (27.2) — both specify their customisation as agent-mediated against this invariant. Why: agent re-application gives durability without preservation machinery, and the upsert paths stay the single write funnel.

### The whole repo is one zoomable map, built for comprehension — showing the essence, not everything

Included: one flow at a time, **hydrated lazily and piecemeal** (a flow's diagram is built the first time its code is worked on, never the whole repo upfront), grouped by behaviour, folded by the file-module scaffold within a legibility budget; inferred edges distinct + click-through-explained (AC#3); the deterministic-essence baseline (the flow boundary already excludes unrelated code; one bounded flow ships at 27.1.6). Deferred: the single whole-repo map with N-tier zoom (27.1.12); clustering as organizer (27.1.11, demoted to chunking input + refactoring signal); the qualitative **salience layer** — first add-on 27.1.7, where the agent selects/ranks the key decisions, suppresses incidental control flow, with shaped nodes + semantic edge labels (not ariadne-gated, 27.1.13). Why: a flow is the same containment primitive, so the map is an additive composition over the generic render seam; salience is the highest-judgement work, cleanly additive over the same render(), so the essence baseline ships in v1 and the qualitative selection layer follows as the first add-on (doc-4's selection-not-exhaustion).

### The diagram and the code stay consistent in both directions

Included (code→diagram only): **per-flow auto-sync** — when a flow you are working on changes, the Claude Code `Stop` hook drives a custom sub-agent to **hydrate** the flow (first time) or **re-sync** it (task-27.1.6), always updating with no review queue; agentic content is regenerated each sync and a relocated symbol is re-anchored inline by the resolver (an unchanged body is a content-hash cache hit). A flow whose seed entrypoint is gone or demoted by a superseding flow is retired, on-demand and only when the turn's changes implicate it. The sub-agent writes the store through the **`drift-sync` skill** (never directly) and returns only a couple of lines to your session; the work deliberately spends your tokens to stay on your radar, and only flows you touch are processed (AC#8). Deferred: the whole **review apparatus** — triage classifier + typed TriageSubject/TriageVerdict contract (27.1.9), drift surfaces + the single PreCommit gate (27.1.10) — and the diagram→code describe-first direction (27.2). Why: v1 keeps the diagram honest by silent auto-sync; review/escalation and authoring come later; the section-F seams keep them additive.

### Authority over each element follows where you keep editing it

Included: descriptions and flow structure are agentic content steered through the agent, which re-applies instructed intent on each pass. Deferred: the absorb-trivial/escalate-structural classifier (27.1.9) and edit-driven authority via diagram→code (27.2). Why: with no protected user-tier fields at the flow and description layers, authority arrives as an agent-mediated design (27.2), not a storage guarantee.

### First milestone

Included exactly: the rename milestone — drift detected and reconciled by the `Stop`-hook-launched sub-agent, the description re-anchored inline onto the renamed symbol — validated first on a skill's flow (task-27.1.2). Deferred: nothing. Why: smallest end-to-end proof of drift re-sync — the content rides the rename via the inline re-anchor (a content-hash cache hit); a distinct first from the skill-flow comprehension-build first — the skill flow is merely its corpus.

### Scope

Included: Claude Code first; degrade gracefully via host-keyed installer + degradation matrix (27.1.1). Deferred: Cursor parity (27.1.8). Why: prove one host first; a second host is a layout entry.

## v1 scope summary and critical path

Critical path (v1 ships at 27.1.6): 27.1.1 → 27.1.2 → 27.1.3 → 27.1.4 → 27.1.6 [v1 SHIPS HERE]. First add-on: 27.1.7 key-control-flow.

## Deferred, with rationale

- 27.1.7 key-control-flow (first add-on): golden-path selection over one flow; the qualitative delivery of "essence, not everything"; the highest-judgement, cleanly-additive work.
- 27.1.8 Cursor parity: portable skill-bundle distribution; prove one host first.
- 27.1.9 drift triage classifier + typed TriageSubject/TriageVerdict contract: the review/escalation layer v1's auto-sync omits; also the task-27.2 reuse seam.
- 27.1.10 drift review surfaces + PreCommit gate: the "surface drift for review" apparatus; v1 has none (pure auto-sync).
- 27.1.11 clustering: demoted to chunking input + refactoring signal (flowcharts beat clustering's ontologies).
- 27.1.12 whole-repo map: post-v1 composition of flows; realizes doc-5's one zoomable map.
- 27.1.13 ariadne precision add-on (upstream): sharpens 27.1.7 at higher confidence; gates nothing.

## Open decisions

Per-flow open decisions (flow-list legibility, large-flow render, flow identity, A-to-B contract, salience, clustering trigger, ariadne ownership/split) are in the sub-tasks of task-27.1. The sub-agent trigger is resolved: the `Stop` hook.

See also: doc-5 (the timeless vision), doc-4, and task-27.1.
