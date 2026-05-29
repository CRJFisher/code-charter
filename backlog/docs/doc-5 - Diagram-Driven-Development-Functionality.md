---
id: doc-5
title: Diagram-Driven Development — Functionality
type: spec
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Functionality

_Target functionality. For the implementation strategy, see **task-27**._

A code-charter diagram is a **peer artifact that sits above the code**: it has its own authored content and its own authority, and it survives on its own rather than being regenerated from the code on demand. Code captures _how_; the diagram captures _what_ and _why_; you shape it by describing the change you want, or by editing it directly. The diagram and the code stay consistent in both directions, and authority over each element follows where you keep editing it.

One invariant governs everything below: **nothing you author is ever lost.** Hand-authored content is never silently overwritten or deleted, deletions are reversible, your work survives crashes, and your source is never edited without your acceptance. A single lost customization would end trust in the tool, so every capability honors this.

## Purpose

The developer manages teams of AI coding agents rather than writing every line, and is the bottleneck: agents change code faster than anyone keeps up by reading every diff. The diagram is the surface for working at that level — a faithful map to comprehend a moving codebase at a glance, and a place to direct and review change as intent rather than as diffs.

## The foundation: the whole repo as one living map

The system reads the whole repo — on first analysis, and again whenever code changes — and renders it as one connected, navigable map whose job is to make the codebase's functionality legible. Comprehension is the point: you see _what the code does_ before you touch it. The map re-renders when code changes; it is not guaranteed instant.

- **Architecture down to functions.** The top level is the system's shape; you drill through functional groups to individual functions and the docs that explain them.
- **Every level stays digestible.** Each level is held under a complexity budget — a cap on the nodes and edges shown at once — and the number of levels is derived from that budget, so a small repo resolves in a couple of levels and a large one in more. No level is a hairball.
- **Grouped by what code does, not where it lives.** Nodes carry human-readable descriptions and cluster by function, so a level reads as a story about behaviour rather than a file tree.
- **Connected end to end.** Entrypoints link to their docs, and calls that static analysis can't resolve are inferred so the graph has no gaps. Inferred links stay visually distinct from extracted ones and trace back to their source; you can accept or reject an inference, and a rejected one does not return.

## Consistency in both directions

You drive code from the diagram, and when code changes the diagram stays honest about it. Authority (below) arbitrates when the two disagree.

### From the diagram to the code

You shape the diagram mainly by describing the improvement you want — "split this module", "group these into a service", "rename this" — and an agent restructures the diagram to match. Direct manipulation is also there when you want it: relabel, group, pin, hide, draw edges. Everything you author is durable and re-attaches itself to its target even after a rename — anchored to the code element rather than to a line or a name — so a description follows a renamed function without re-typing. A customization that can't re-attach waits, recoverable, in a re-anchoring bin where you reattach it by hand; it is removed only when you delete its element yourself.

Each change to the diagram's structure becomes a proposed edit, and a second agent interprets how actionable it is — whether it maps to a concrete code change (rename, move a function between groups, delete) and how large its blast radius is, or whether it is diagram-only. Actionable proposals show the matching code change — for a delete, the call sites that break shown first — which you review as a side-by-side before/after diff and accept or revert. Nothing touches your source until you sign off; on accept the edits land in your working tree, never committed for you, the code is re-read, and the diagram re-renders with your authored content carried along. If the code moved since you reviewed, the proposal is flagged stale rather than applied blindly. Adding a node is the same conversation: you describe what it should do and it becomes an ordinary coding task.

### From the code to the diagram

When code changes and drifts from the diagram — a renamed or split function, a deleted caller, a new edge — the gap is collected as a reviewable observation, silent by default and scoped to what you're working on. The one deliberate interruption is a pre-commit gate when a consequential drift — one that changes the system's structure, not a reflowed comment — would otherwise ship unnoticed. The unresolved design question is _when_ to surface drift: get it wrong and the experience feels like paperwork rather than a live, two-way conversation.

## Authority: who owns each element

When the diagram and the code disagree about an element, authority decides which wins. Authority follows where your edits keep landing — the diagram if you keep shaping it there, the code if you keep changing it there — and you can pin an element to claim it ahead of time and override the inference. You can see and change which side currently owns an element. When you and an agent touch the same element at once, the pin and the most recent intentful edit arbitrate. The agent resolves trivial and cosmetic drift on its own — a reflowed description, a moved line — and escalates only the genuinely architectural — a changed call structure, a removed entrypoint — to you.

## First milestone

Rename a script in a Claude Code skill, open your session, and a banner reports one drifted node. Click **Accept** on the diagram and your hand-written description snaps onto the renamed node, untouched — a human sentence surviving a refactor without anyone re-typing it.

## Scope

The same experience is reachable across agentic coding hosts — Claude Code first, then Cursor — though the most live surfaces, such as the in-session drift banner, depend on host capabilities and degrade gracefully where a host lacks them.

See also: `vision.md`, `doc-4 — Useful Diagrams For Software Development`, and **task-27** for the implementation strategy.
