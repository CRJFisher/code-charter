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

v1 lets you quickly understand the **essence of a code-tree**: it surfaces agent-detected **flows** one at a time via a left-panel selector, renders each as its own diagram, and keeps each flow honest as the code changes, without ever interrupting your session.

## The v1 unit: the flow

The comprehension unit is a **flow**: the subgraph induced by seed entrypoint roots + agent-inferred bridge edges across those trees + linked docs. The deterministic call-graph fills each tree's interior; the agent judges only the seam. A flow is the **tiling block** of doc-5's whole-repo map, surfaced one-at-a-time first. A left-panel flow selector replaces the entrypoint list; on open the top-ranked flow auto-renders. A deterministic stub-flow set ships the selector and render before the detection agent lands; flow-detection skill A upgrades the stubs in place. The first end-to-end target is a Claude Code skill's flow.

## The organizing seam

Deterministic substrate (objective, free, L0): Ariadne call/import edges, the function-to-file-to-directory scaffold, literal doc/frontmatter edges, entrypoint roots. Agent-detected structure (subjective, goal-dependent, L1 on the agent.inferred lane): flow boundary, label, bridge edges, doc attachment, and as the first add-on the salience of key control flow. The agentic lane carries lower confidence, an inference_rationale, renders distinct, is click-through-explained, accept/reject persisted and never re-proposed. v1 fixes one detection goal (essence of a code-tree), keeping task-27.2 and the deferred map additive.

## Per-principle manifestation

### Anything you author is always considered

Included, fully and first: write_fields promotes a row's layer to user so a user-owned field survives rebuild_layer('agentic') (27.1.2, a prerequisite); authored content (a description, a name, a pin) is recalled and presented to the triage sub-agent during drift triage so your intent is carried across each code→diagram update (27.1.7); recoverable re-attachment bin for resolver failure or flow split/merge stranding a name/pin (AC#9). Deferred: nothing. Why: trust floor; machinery is kind-agnostic so pins (arriving with 27.1.9) are covered.

### The whole repo is one zoomable map, built for comprehension — showing the essence, not everything

Included: one flow at a time, grouped by behaviour, folded by the file/dir scaffold within a legibility budget; inferred edges distinct, gone once rejected (AC#3); the deterministic-essence baseline (the flow boundary already excludes unrelated code; one bounded flow ships at 27.1.6). Deferred: the single whole-repo map with N-tier zoom (27.1.12); clustering as organizer (27.1.11, demoted to chunking input + refactoring signal); the qualitative **salience layer** — first add-on 27.1.9, where the agent selects/ranks the key decisions, suppresses incidental control flow, with shaped nodes + semantic edge labels (not ariadne-gated, 27.1.13). Why: a flow is the same containment primitive, so the map is an additive composition over the generic render seam; salience is the highest-judgement work, cleanly additive over the same render(), so the essence baseline ships in v1 and the qualitative selection layer follows as the first add-on (doc-4's selection-not-exhaustion).

### The diagram and the code stay consistent in both directions

Included (code-to-diagram only): per-flow drift engine (membership is the proximity boundary; verify-then-update; drift_observations/drift_adjudications; AC#5/#6); typed TriageSubject/TriageVerdict (27.1.7); single PreCommit gate (AC#7); all maintenance via a background sub-agent that returns nothing (AC#11), off your attention and context. Deferred: the diagram-to-code describe-first direction (27.2). Why: build/keep-honest precedes authoring; section-G seams keep 27.2 additive.

### Authority over each element follows where you keep editing it

Included: per-field watermark-wins on descriptions (AC#2); pins/adjudications never re-surfaced (AC#6); absorb-trivial/escalate-structural classifier. Deferred: edit-driven authority via diagram-to-code (27.2). Why: v1's only authored surface is descriptions/pins/adjudications.

### First milestone

Included exactly: the rename milestone, validated first on a skill's flow (27.1.2, AC#10). Deferred: nothing. Why: smallest end-to-end proof of preservation+drift; a distinct first from the skill-flow comprehension-build first — the skill flow is merely its corpus.

### Scope

Included: Claude Code first; degrade gracefully via host-keyed installer + degradation matrix (27.1.1), MCP-pull read fallback. Deferred: Cursor parity (27.1.10). Why: prove one host first; a second host is a layout entry.

## v1 scope summary and critical path

Critical path (v1 ships at 27.1.6): 27.1.1 → 27.1.2 → 27.1.3 → 27.1.4 → 27.1.5 → 27.1.6 [v1 SHIPS HERE]. First add-on: 27.1.9 key-control-flow.

## Deferred, with rationale

- 27.1.9 key-control-flow (first add-on): golden-path selection over one flow; the qualitative delivery of "essence, not everything"; sequenced after v1 as the highest-judgement, cleanly-additive work.
- 27.1.10 Cursor parity: portable skill-bundle distribution; prove one host first.
- 27.1.11 clustering: demoted to chunking input + refactoring signal (flowcharts beat clustering's ontologies).
- 27.1.12 whole-repo map: post-v1 composition of flows; realizes doc-5's one zoomable map.
- 27.1.13 ariadne precision add-on (upstream): sharpens 27.1.9 at higher confidence; gates nothing.

## Open decisions

Per-flow open decisions (flow-list legibility, large-flow render, flow identity, A-to-B contract, salience, clustering trigger, sub-agent trigger, ariadne ownership/split) are in the sub-tasks of task-27.1.

See also: doc-5 (the timeless vision), doc-4, and task-27.1.
