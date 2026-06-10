---
id: doc-5
title: Diagram-Driven Development — Functionality
type: spec
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Functionality

_Target functionality. For the implementation strategy, see **task-27**._

A code-charter diagram is a peer artifact above the code: code captures _how_, the diagram captures _what_ and _why_, carrying its own authored authority, never regenerated on demand. You direct teams of AI agents and become the bottleneck; the diagram is your surface at that altitude — comprehend a moving codebase at a glance, direct change as intent, not diffs.

## Customisation is agent-mediated at every layer

What you want the diagram to say — a description, a name, an emphasis — you express to the agent, and the agent authors it into the diagram and re-applies it on every sync. No diagram layer stores direct human byte-edits: flow-layer and description writes are wholesale agentic upserts that replace the row's layer and field ownership outright, and agentic content is regenerated each sync. Human-authored inputs that reach the diagram — docstrings, doc frontmatter — live in the code and are deterministically re-read each sync. Your intent persists because the agent re-applies it, not because the store protects it.

## The whole repo is one zoomable map, built for comprehension

One connected map, architecture down to functions, grouped by behaviour and built to show what matters — the decisions that fork behaviour and the golden paths, with incidental control flow quieted, because comprehension needs the essence, not a faithful redrawing of every edge; a complexity budget caps each level and sets the level count; inferred gap-edges stay distinct, traceable, and gone once rejected.

> **v1 scope (task-27.1):** v1 surfaces the map's **tiling blocks one at a time** — a left-panel selector of agent-detected **flows** (functionality umbrellas linking call-graphs + docs), each rendered as its own diagram — as the path toward this whole-repo map. A flow is the same containment primitive the map composes, so the single zoomable map is the post-v1 composition of flows over the file/directory scaffold (task-27.1.12), not a separate build.

## The map fills in where you work

The diagram is built piecemeal, following your attention: a flow's diagram is created the first time you work on its code, and kept in step only while you keep working there. The repo is never diagrammed wholesale up front. The agent's effort — and your token cost — is spent only on the code you actually touch, so comprehension accrues exactly where you need it and nowhere you don't. The whole-repo map is the limit this approaches as your work spreads, not a batch job run ahead of you.

## The diagram and the code stay consistent in both directions

Diagram drives code; code keeps the diagram honest; authored authority breaks ties.

### From the diagram to the code: describe-first

Describe the change; an agent restructures the diagram, another judges actionability and blast radius; edits land only as a diff you accept.

### From the code to the diagram: drift surfaces for review

Drift is a silent, work-scoped observation the diagram absorbs out-of-band — off your attention and your context, never an interruption.

## Authority over each element follows where you keep editing it

Authority follows edits; instruct the agent to pin and it records and re-applies that intent on each pass; ownership stays visible and flippable; agents absorb trivial drift, escalate architectural change.

## First milestone

Rename a script; the diagram re-syncs out-of-band and the description follows the renamed symbol intact — an unchanged body is a content-hash cache hit, so nothing is regenerated and no review step intervenes.

## Scope

One diagram experience across hosts — Claude Code first, then Cursor; live surfaces degrade gracefully where unsupported.

See also: `doc-5.1 — v1 Manifestation` (how this functionality is delivered in v1: included / deferred / why), `vision.md`, `doc-4 — Useful Diagrams For Software Development`, and **task-27** for the implementation strategy.
