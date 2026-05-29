---
id: doc-5
title: Diagram-Driven Development — Functionality
type: spec
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Functionality

_Target functionality. For the implementation strategy, see **task-27**._

A code-charter diagram is a peer artifact that sits above the code: the code captures _how_, the diagram captures _what_ and _why_, and the diagram carries its own authored content and authority rather than being regenerated on demand.

You manage teams of AI coding agents instead of writing every line, and you are the bottleneck — agents change code faster than anyone keeps up by reading every diff. The diagram is the surface for working at that level: a map to comprehend a moving codebase at a glance, and a place to direct change as intent rather than as diffs.

## Nothing you author is ever lost

This invariant governs everything below: hand-authored content is never silently overwritten or deleted, deletions are reversible, your work survives crashes, and your source is never edited without your acceptance.

A single lost customization would end trust in the tool, so every capability honors it.

## The whole repo is one zoomable map, built for comprehension

The system renders the entire repo as one connected, complexity-budgeted map whose job is comprehension — you see _what the code does_ before you touch it.

It re-renders when code changes, though not instantly.

- **Architecture down to functions.** Drill from the system's shape through functional groups to individual functions and their docs.
- **Every level stays digestible.** Each level is capped by a complexity budget — a limit on the nodes and edges shown at once — and the number of levels follows from that budget, so no level is a hairball.
- **Grouped by what code does, not where it lives.** Nodes carry human-readable descriptions and cluster by function, so a level reads as a story about behaviour.
- **Connected end to end.** Calls static analysis can't resolve are inferred to close gaps; inferred links stay visually distinct, trace to their source, and a rejected inference does not return.

## The diagram and the code stay consistent in both directions

You drive code from the diagram, and when code changes the diagram stays honest about it; authority arbitrates when the two disagree.

### From the diagram to the code: describe-first

You shape the diagram mainly by describing the change you want — "split this module", "rename this" — an agent restructures the diagram, and a second agent judges how actionable the resulting edit is; direct manipulation is secondary.

Authored content anchors to the code element, not a line or name, so a description follows a renamed function without re-typing; one that can't re-attach waits, recoverable, in a re-anchoring bin until you reattach or delete its element.

The actionability judgment decides whether an edit maps to a concrete code change (rename, move, delete) and its blast radius, or is diagram-only. Actionable proposals show the matching code change — for a delete, the breaking call sites first — as a before/after diff you accept or revert. Nothing touches your source until you sign off; on accept the edits land in your working tree (never committed for you), the code is re-read, and the diagram re-renders with your authored content carried along. A proposal stale against moved code is flagged, not applied. Adding a node is the same conversation: you describe what it should do, and it becomes an ordinary coding task.

### From the code to the diagram: drift surfaces for review

When code drifts from the diagram — a rename, a split, a deleted caller, a new edge — the gap is collected as a reviewable observation, silent by default and scoped to your current work.

The one deliberate interruption is a pre-commit gate when a consequential drift — one that changes the system's structure, not a reflowed comment — would otherwise ship unnoticed. When to surface drift without it feeling like paperwork is the open design question.

## Authority over each element follows where you keep editing it

When the diagram and the code disagree, authority decides which wins, and it follows where your edits keep landing — the diagram if you keep shaping it there, the code if you keep changing it there.

Pin an element to claim it ahead of time and override the inference; you can always see and change which side owns it. When you and an agent touch the same element at once, the pin and the most recent intentful edit arbitrate. The agent resolves trivial drift itself — a reflowed description, a moved line — and escalates only the architectural — a changed call structure, a removed entrypoint.

## First milestone

A script in a Claude Code skill gets renamed in the code. Open your session and a banner reports one drifted node; accept it, and the diagram re-renders onto the renamed script with your hand-written description carried along, untouched — a human sentence surviving a refactor without anyone re-typing it.

## Scope

The same experience reaches across agentic coding hosts — Claude Code first, then Cursor — with the most live surfaces, such as the in-session drift banner, degrading gracefully where a host lacks the capability.

See also: `vision.md`, `doc-4 — Useful Diagrams For Software Development`, and **task-27** for the implementation strategy.
