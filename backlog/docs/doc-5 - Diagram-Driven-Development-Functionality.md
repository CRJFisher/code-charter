---
id: doc-5
title: Diagram-Driven Development — Functionality
type: spec
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Functionality

A code-charter diagram is a **first-class statement of intent that lives above the code**. Your hand-authored content is never lost, the diagram and code stay consistent in both directions, and authority over each part follows where you keep editing.

This is _what_ the system does. For _how_, see **task-27**.

## Why this matters now

Software is moving up a level: the developer increasingly manages teams of AI coding agents rather than writing every line. At that level the human is the bottleneck — agents produce change faster than anyone can keep up by reading all the code, and manual review doesn't scale to the pace. Operating as a manager needs tools that make the high level rapid and automatic: a faithful map to comprehend a moving codebase at a glance, and a surface to direct and review change as intent rather than diffs. That is what this system is for.

## The diagram as a peer artifact

The diagram is a peer to the code, not a rendering of it: code captures _how_, the diagram captures _what_ and _why_, and you edit it directly. The five capabilities below follow from that. The first — a legible map of the whole repo — is the foundation; authoring, driving code, and staying consistent all build on it.

## 1. The whole repo as one living map

The first thing the system does with any repo — on first analysis, and again whenever code changes — is read it whole and render it as one connected, navigable map whose job is to make the codebase's functionality legible. Comprehension is the point: you should be able to see _what the code does_ before you touch it.

The map is hierarchical and zoomable:

- **Architecture down to functions.** The top level is the system's shape; you drill through functional groups to individual functions and the docs that explain them.
- **Every level stays digestible.** Each zoom level is held under a bounded complexity budget, and the number of levels is derived from that budget — a small repo resolves in a couple of levels, a large one in more. You never face a hairball.
- **Grouped by what code does, not just where it lives.** Nodes carry human-readable descriptions and cluster by function, so a level reads as a story about behaviour rather than a file tree.
- **Connected end to end.** Entrypoints link to their docs, and calls that static analysis can't resolve are inferred so the graph has no dangling holes. Inferred links stay visually distinct from extracted ones and trace back to their source, so you always know what's certain and what's a guess.

When code changes the map re-renders to match, carrying your authored content along (capability 2). The same map is where you author and from which you drive code (capabilities 2–3).

## 2. Author on the diagram, and it sticks

The diagram is an authoring surface — relabel, describe, group, pin, hide, draw edges — and everything you author is immortal, re-attaching to a renamed function without re-typing. Nothing is silently overwritten or deleted; a customization that can't re-attach waits, recoverable, in a re-anchoring bin until you delete its element yourself.

## 3. Drive code from the diagram

Editing the diagram's structure proposes the matching code change — rename, delete (blast radius shown first), or move — which you review as a side-by-side diff and accept or revert; nothing touches your source until you sign off. On accept the edits land in your working tree (never auto-committed), the code is re-read, and the diagram re-renders with your customizations carried along. Adding a node opens a prompt and becomes an ordinary coding task.

## 4. The diagram stays honest about the code

When code changes and diverges from the diagram, the gap is collected as a reviewable observation — silent by default, scoped to what you're working on, surfaced at sensible moments rather than inline. The one deliberate interruption is a pre-commit gate when a consequential divergence would otherwise ship unnoticed.

## 5. You set intent; the agent does the legwork

Authority over each element is inferred from where your edits keep landing — the diagram if you keep shaping it there, the code if you keep changing it there — and you can pin an element to claim it ahead of time. The agent resolves trivial and cosmetic divergences automatically and escalates only the genuinely architectural to you.

## The promise underneath: trust

One lost customization would end trust in the tool. So nothing you author is ever silently overwritten or deleted, deletions are reversible, your work is durable across crashes, and your source is never edited without your acceptance.

## First beachhead

Rename a script in a skill, open your session, and a banner reports one drifted node. Click **Accept** on the diagram and your hand-written description snaps onto the renamed node, untouched — a human sentence surviving a refactor without anyone re-typing it.

## The central open question

The ideal is a live two-way surface where editing the diagram and resolving in code is one continuous conversation. Until then, **when to surface a divergence** is the open question that decides whether the experience feels live or like paperwork.

## Across hosts

The same experience is reachable across agentic coding hosts — Claude Code first, Cursor next.

See also: `vision.md`, `doc-4 — Useful Diagrams For Software Development`, and **task-27** for the implementation strategy.
