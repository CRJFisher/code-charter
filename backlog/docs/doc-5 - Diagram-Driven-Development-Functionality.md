---
id: doc-5
title: Diagram-Driven Development — Functionality
type: spec
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Functionality

## The vision in one sentence

A code-charter diagram is a **first-class statement of intent that sits above the code**: your customizations are immortal, divergence between code and diagram is collected into a reviewable inbox, and authority over each part of the system follows where you keep editing.

## Who this is for

A developer working in a codebase — editing skills, scripts, and the modules that make them up — who wants a diagram of the system that stays _true_. They sketch architecture on the diagram, refactor in the code, and never want to discover later that the picture and the code have quietly drifted apart, or that a hand-written note was lost in a rename. The system's job is to keep the two artifacts honest with each other while protecting everything the developer authored by hand.

## The diagram as peer artifact

The diagram is not a viewing aid for code. It is a **high-level artifact that sits above the code at architectural scale**, kept consistent with it by two-way sync. Code captures _how_; the diagram captures _what_ and _why_. Both are first-class — neither is derived from the other. Edits made to code are reflected as proposed updates to the diagram, and edits made to the diagram are reflected as proposed changes to code. The two are kept coherent in both directions without either losing its voice.

The diagram is also a genuine authoring surface. A user can rename, group, hide, relabel, add, delete, and draw edges directly on it. Those are real affordances, not decorations on a read-only picture — and each carries meaning that the system acts on (see _Bidirectional sync_).

## The round-trip, as experienced

The end-to-end workflow is a continuous loop, not a one-way export:

1. **Open the repo** and see it as a single diagram — oriented at a high level, drillable down to individual functions and their documentation.
2. **Edit code** as normal. Where a change diverges from what the diagram says, the divergence is collected quietly as a reviewable observation.
3. **Review drift** at your convenience — work through outstanding items, accepting re-anchors and resolutions or dismissing them.
4. **Edit the diagram** — rename a node, regroup, delete, add — as a statement of intent about the code.
5. **Review proposed code changes** side-by-side before anything is written, then accept or back out.
6. After an accepted change lands, the code is re-read and the diagram **re-renders to match the real new code** — and your hand-written content follows along. The loop is closed: the diagram never describes code that no longer exists, and the code never silently contradicts the diagram.

## Capability areas

### 1. The diagram as a peer artifact above code

- The whole system is presented as one coherent diagram that captures intent at architectural scale.
- The diagram and the code are kept consistent **in both directions**. Neither is a derived rendering of the other.
- The diagram is editable as a first-class surface: relabel, describe, group, hide, pin, add, delete, and draw edges directly on it.

### 2. Customizations that survive code change

Everything you author by hand on the diagram is **immortal**. The system never silently overwrites or auto-deletes anything you created. Specifically preserved across code change, re-extraction, refactors, and renames:

- **Labels** you have written.
- **Descriptions** — the free-text sentences you attach to nodes.
- **Group memberships** — how you have organized nodes.
- **Layout** — pinned positions you have arranged.
- **Manual edges** — relationships you drew that extraction didn't find.
- **Pins** — your deliberate claims of authority (see area 4).

The never-lost guarantee is concrete: **a hand-written description survives a refactor without re-typing.** When code is renamed or restructured, the description re-attaches to the corresponding node automatically — you never re-enter it. This is the headline promised experience.

From the user's perspective, the content you author lives **separately** from the machine-extracted structure. Automatic re-reading of the code can refresh the structure without disturbing anything you wrote.

When a customization can no longer be attached to any code element, it is **never deleted** — it is held safely in a re-anchoring bin, with full context, until it can be re-attached. A customization is only retired when _you_ deliberately delete its element, not when drift orphans it; orphaned content is always recoverable.

When the agent discovers something automatic extraction missed, it can record that discovery as anchored, first-class authored content — so gaps in extraction become visible authored knowledge rather than silent omissions.

### 3. Drift surfaced as reviewable observations

When code or docs change in ways that diverge from the diagram, the divergence is collected as **observations you can review at your convenience** — never an interrupting alarm. By default the system is silent.

- Outstanding divergences form a **punch list** you work through. Each item can be triaged, resolved, dismissed, or left to expire on its own.
- **Dismissing is safe and remembered** — a dismissed item is not raised again; you will not be re-nagged about a divergence you have judged acceptable.
- Drift is surfaced at sensible, non-intrusive moments: as a punch list when you begin a session; as a scoped, one-line nudge when your prompt mentions a relevant file; on request via a walkthrough; or as an ambient status count. It is **never injected inline** into an active edit.
- Drift is **scoped to what is relevant** — limited to what is structurally near the changed code — so the inbox stays manageable and the silence-by-default experience stays trustworthy. You are not flooded.

There is exactly **one intentional blocking interruption**: when high-severity drift touches files included in a commit, you must acknowledge it before the commit proceeds. _Severity_ is the system's judgment of how consequential a divergence is — a cosmetic mismatch never blocks you, but a divergence that would let the diagram lie about something structural is held at the commit gate so it cannot slip through unnoticed.

### 4. Authority that follows where you edit

Whether the diagram or the code is treated as the authority for a given element is **inferred from where your edits keep landing** — not declared up front. There is no ceremony and no obligation to mark anything in advance.

- If you keep shaping an element on the diagram, the diagram is treated as authoritative for it.
- If you keep changing it in code, the code is treated as authoritative.
- Edits the agent makes purely to carry out a decision you already made do not reset this — authority tracks _your_ intent.

You can also **pin** an element to claim diagram-authority _ahead of time_. Pinning lets you assert that the diagram owns a boundary before the code drifts into it, so subsequent code changes are surfaced as drift against your deliberate decision rather than overwriting it.

### 5. Cosmetic vs. intent, from your view

The system distinguishes changes that carry architectural meaning from changes that are merely cosmetic. Editing a description is cosmetic; renaming an identifier is a real statement of intent. Easy cases are handled for you without a prompt. Only the genuinely ambiguous middle — for example, renaming a group that lines up with a folder of code — is brought to you for a decision. You are never bothered about changes that plainly don't matter, and never left out of changes that plainly do.

### 6. The agent triages, you adjudicate

There is a clear division of labor:

- The **agent triages** every divergence. No-ops stay silent. Minor, unambiguous changes are resolved automatically. Genuinely architectural questions are escalated to you.
- **You adjudicate** the architectural decisions. The system never makes a consequential, irreversible call on your behalf.

The system **never silently mutates your source.** It surfaces obligations and proposes changes; the acceptance is always yours.

### 7. Bidirectional sync

Consistency runs both ways, and each direction is a first-class capability.

- **Code → diagram.** When your code changes diverge from what the diagram's authored content says, the system detects the resulting staleness — a rename, a deletion, a contract change — and surfaces it as a reviewable observation rather than letting it pass. Real divergences are caught; the diagram is kept honest about the code.
- **Diagram → code.** When you (or an agent acting for you) change the _structure_ of the diagram, that edit is treated as a statement of intent about the code, and the system proposes the matching code change for your review.

Code → diagram resolutions are reviewable just as proposed code changes are: an accepted re-anchor or resolution can be inspected, and you remain in control of whether it stands.

### 8. The pending-edits / side-by-side review workflow

This is the diagram→code half of two-way sync, experienced as a review workflow. The diagram sits above the code; when you edit the _structure_ of the diagram, the system treats that as intent about the code and works to make the code match. **You are always the adjudicator: code never changes until you review and accept a concrete proposal.**

#### The core promise

- **You can edit the diagram and the code will follow.** Renaming, deleting, or regrouping an element on the diagram is a request to make the same change in the code. The system proposes the matching code change; you decide whether it lands.
- **Nothing touches your code without your sign-off.** Every diagram-driven edit becomes a _proposal_ you review side-by-side before it is applied. A diagram edit is never silently written to source.
- **The two stay consistent in both directions.** After you accept a proposal and the code change lands, the code is re-read and the diagram re-renders to reflect reality — so the diagram is never left describing code that no longer exists.
- **Your customizations survive the round-trip.** A node's hand-written description, color, group membership, and layout pin follow the element through a rename or move. Renaming a node on the diagram does not orphan the sentence you wrote about it.

#### What a diagram edit means, per operation

Structural diagram edits map to a small, fixed set of code operations, each with a distinct meaning and experience:

- **Rename** — You change a node's identifier-shaped label (the _name_, not the free-text description). Meaning: rename the underlying symbol in code and update every reference. The proposal shows the declaration and every place that refers to it. This is the flagship case and the safest, because the intent is unambiguous.
- **Delete** — You remove a node. Meaning: remove the corresponding symbol from code. Because deletion is destructive and high-blast-radius, the proposal shows every relationship (callers, references) that will break or also need removal, so you see the full set before accepting. On the diagram the node is soft-removed (recoverable) until the code change lands.
- **Group / regroup** — You drag nodes into a new group, create a group, or move a node between groups. Moving a symbol into a different module-group proposes a _move_ of the symbol to a different file/module and updates imports. Pure visual grouping that does not correspond to a code boundary makes no code claim and stays diagram-only.
- **Add** — You create a new node. Because a bare node has **no spec** for what it should do, this cannot become a mechanical code edit. Instead, adding a node opens a prompt panel: you describe what the new element should do, and the system turns that into a normal coding task. The added node renders as _proposed_ (visually distinct) until real code exists.
- **Edit description / color / layout** — Cosmetic, diagram-only. These never produce a code change; they live with your other customizations.

#### Who initiates: two cases, same review surface

1. **You edit the diagram directly** — rename a node, drag into a group, delete. Each structural edit is captured as a queued proposed operation. You keep editing freely; proposals accumulate.
2. **The agent proposes a diagram→code edit on your behalf** — e.g. "this helper should be renamed for clarity." From your perspective the review experience is identical: the proposal appears in the same pending-edits surface with a rationale attached. The only difference is provenance — the proposal is labeled as agent-originated and carries the agent's reason. Every proposal, user- or agent-originated, can carry a rationale, so you are never asked to accept a change with no explanation.

In both cases the contract is the same: **propose, then preview-and-confirm.** The agent never applies a structural code change without you accepting it in the review view.

#### Multiple edits before review (change sets)

You can make many diagram edits in a row without reviewing each one. The edits collect into a single pending **change set** — the unit you review. You might rename three nodes and delete one, then open review once. The review view presents the whole change set together so you see the combined effect, not a stream of interruptions. This mirrors the real workflow of sketching a refactor on the diagram and then deciding to commit it.

#### The review (diff) view

When you open review (via the pending-edits surface or the drift walkthrough), you see a **side-by-side before/after view**:

- A side-by-side text diff per affected file. For each proposed operation, the relevant code _before_ is on the left and _after_ on the right, with changed regions highlighted. For a rename, that is the declaration line and each reference line.
- Each proposed operation in the change set is a reviewable item, with its rationale (especially for agent-originated proposals) shown alongside.
- You can **accept** the change set or **reject** it.

#### Accept / reject / revert

- **Accept.** The proposed code edits are applied to the working tree. The diagram's structural edits become real (the proposed styling drops away). The code is re-read; the diagram re-renders from the updated structure; your descriptions, colors, and pins re-anchor onto the renamed/moved elements so nothing hand-written is lost. The round trip is complete: diagram edit → code change → re-read → diagram reflects the landed code.
- **Reject.** No code is touched. The diagram is restored to its pre-edit state; the proposed structural edits are discarded.
- **Revert-all.** A single action discards the entire pending change set before it is accepted. You are never stuck with a half-built set of diagram edits you can't cleanly undo.

#### What happens to the code on accept

Accepted operations are applied to the working tree as ordinary source edits (a rename rewrites the declaration and references; a delete removes the symbol and, per your review, its now-dead references; a move relocates the symbol and fixes imports). The edits land as a reviewable diff in your source control — they are **not committed automatically.** You retain the normal ability to inspect, amend, or discard them like any other change.

#### What happens to the diagram after the change lands

The diagram is not left as a hand-edited fiction. Once the code change is in the working tree, the code is re-read and the diagram re-renders, with your customizations re-anchored onto the changed elements. The diagram you sketched now matches code that genuinely exists, and the proposed/pending styling is gone. If the applied change differs from what the diagram showed (e.g. the rename couldn't be fully applied), that divergence surfaces as a normal drift item rather than being hidden.

#### Edge cases

- **A proposal conflicts with code that changed underneath.** Between making a diagram edit and accepting it, the underlying code may have moved (another edit, a pull, an agent change). On accept, if the target no longer matches, the proposal is treated as **stale** — it is not blindly applied. You are shown that it no longer cleanly applies and offered the choice to re-resolve it against the current code or discard it. The guarantee: a stale proposal never corrupts code by applying to the wrong place.
- **Delete with dependents.** Deleting a node that other elements depend on shows you the full blast radius before you accept, so a delete is never a silent breakage.
- **Group with no code meaning.** Regrouping that doesn't correspond to a real code boundary makes no code claim — it stays a diagram-only customization and produces no proposal.

#### User-visible guarantees (summary)

- A diagram structural edit always produces a reviewable proposal, never a silent code write.
- You can batch many diagram edits and review them as one change set.
- You can always back out.
- Accepting closes the loop — code changes, the diagram reflects the real new code, and customizations survive.
- Stale proposals (code moved underneath) are caught and re-resolved or discarded, never misapplied.
- Agent-originated and user-originated proposals are reviewed identically; agent proposals carry a rationale.

### 9. The whole repo as one zoomable diagram

The entire codebase is **one connected, navigable artifact** — a single map you can open, get oriented in at a glance, and drill into until you reach individual functions and their documentation. There is no longer a gap between "the skill view," "the pipeline view," and "the rest of the repo." It is one diagram. Per-skill and per-scope views still exist, but as _entry points into_ and _filtered slices of_ the same whole-repo graph, not separate diagrams you assemble in your head.

#### Zoom levels: a digestible map at every altitude

You open the repo at the **top zoom level** and see a small number of large boxes — the highest-level architectural groupings. The promise: **no zoom level ever dumps an overwhelming wall of nodes.** Each level shows a digestible amount; going deeper reveals more detail.

- **Drill down**: open a box to descend a level. Its contents expand into the next tier of groupings or, eventually, individual functions and docs.
- **Zoom out**: collapse back up to regain the overview.
- **The number of levels is not fixed.** A small repo might have two levels (overview → functions); a large one might have five. The depth follows the repo's complexity, so the _experience_ — "each screen is comprehensible" — is constant regardless of repo size.
- **Stable orientation**: a given subsystem lives in a predictable place across levels, so drilling in and out doesn't disorient you.
- At the **leaf level** you reach individual nodes — a function, a SKILL.md, a reference doc — with full provenance and your customizations intact.

#### What the connected diagram delivers

Raw extraction leaves a graph that is fragmented: disconnected islands, dangling entrypoints, missing call edges where static resolution couldn't reach. The system reconciles this into one connected whole and delivers two things:

1. **Entrypoint-to-documentation links.** Every entrypoint — a CLI command, an HTTP handler, a skill's SKILL.md, an exported public API, a test root — is connected to the documentation that describes it. You can start from "what the system does" and trace down into "how it does it," and back up. Orphaned entrypoints — code that does real work but that nothing visibly reaches — are surfaced rather than left silently floating.
2. **Gap-filled call edges.** Where static resolution falls short — dynamic dispatch and other convention-based wiring that static analysis can't follow — the missing edges are inferred so the call graph actually connects. You see a continuous path from entrypoint to leaf instead of a tree that dead-ends at the first dynamic hop.

The net promise: **the whole repo links up into a single connected diagram**, and the dead-ends and orphans that make a raw call graph frustrating are reconciled.

#### Distinguishing what was seen from what was inferred

You must always be able to tell **what the tool literally saw** from **what was inferred**. This is a trust requirement, not a nicety.

- **Literal-extracted edges** (resolved calls, real markdown links, frontmatter declarations) render as solid, first-class structure. These are facts.
- **Inferred edges** (gap-filled dynamic calls, inferred entrypoint→doc links) render with a **visually distinct treatment** and a label saying they were inferred. Selecting one shows _why_ it was proposed — the reasoning and the evidence it keyed on.
- **Completeness signal at each zoom box**: a grouping can communicate that it contains unresolved gaps ("3 inferred edges inside," "1 orphaned entrypoint") so you know where the map is solid and where it leans on inference.
- Inferred edges are **proposals you can accept, reject, or correct.** An accepted inference graduates into first-class authored knowledge. A rejected one is suppressed and not re-proposed. Your adjudications are never lost across re-reads.

#### Provenance click-through

The diagram visibly distinguishes code structure from documented structure — code nodes, doc nodes, and the cross-modal relationships between them (e.g. a SKILL.md, its scripts, and its reference docs all get distinct visual treatments). Selecting any node reveals **why it exists and why it links to another**: its metadata (such as frontmatter) and the source prose spans that drove its outgoing edges, so you can trace each relationship back to its origin.

### 10. Trust guarantees

One promise drives every capability above: **you can trust that your work is safe.** A single lost customization would end your trust in the tool, so the system is built so that this cannot happen.

- **Nothing you author is ever silently overwritten or auto-deleted.**
- **No user-visible operation permanently destroys content** — deletions are reversible and restorable, so you can recover from mistakes.
- **Orphaned customizations live forever** in a re-anchoring bin until they can be re-attached.
- **Your authored content is durable across crashes and restarts** — it is not lost if a process fails or restarts.
- **The system never silently edits your source** — every code change is yours to accept.

### 11. The realtime-interactivity goal

The desired experience is a **live, two-way working surface**: you edit the diagram, the agent receives the change, and resolution is interactive — the diagram and code feel like a single continuous conversation rather than a batch process. The whole experience should feel **fast** for a single skill: rendering and re-rendering happen in seconds, not minutes, so the diagram reads as a live surface you are working on, not a report you regenerate.

Until the experience is fully realtime, the same capabilities are delivered through well-chosen moments — a session-start punch list, a scoped nudge when your prompt mentions a relevant file, an on-request walkthrough, the pending-edits review, and the pre-commit acknowledgement gate. **When is the right moment to surface drift to the user?** remains the central open question of the experience; the answer it converges on is the difference between a tool that feels live and one that feels like paperwork.

## The same experience across host tools

You get a usable diagram-driven-development experience in more than one agentic coding host — Claude Code as the primary target, Cursor next — without having to think about per-tool differences. The capabilities described here are the same wherever you work.

## MVP — first beachhead

The first slice proves the headline promise end to end, in functional terms:

Rename a script in a skill. Open your coding session. A session-start banner reports **one drifted node**. Open the diagram. A badge marks the renamed node. Click **Accept**.

The hand-written description — _"Entry point for SVG output — called by the skill's post-tool-use hook"_ — **snaps onto the new node, untouched.**

A human sentence surviving a refactor without anyone re-typing it is the entire pitch. This beachhead demonstrates the never-lost customization guarantee, the survive-a-refactor experience, drift surfaced as a reviewable observation, and the accept-to-resolve path — the smallest experience that makes the peer-artifact thesis real.

## Why this matters

Three long-standing limits stop being separate problems:

- **Extraction gaps** — discoveries the agent makes become first-class authored knowledge, anchored stably, instead of silent omissions.
- **Fragile customizations** — immortal by construction.
- **Read-only diagrams** — authority-by-observation plus pin-as-override turns the diagram into an authoring surface without a big-bang commitment.

With those resolved, the diagram earns its standing as a peer artifact above the code. Customizations survive code change, authority is bidirectional, and consistency is kept in both directions. **Diagram-driven development moves from CASE-tool fantasy to a working capability where code and diagram coexist as peer artifacts at different levels of abstraction.**

## Implementation

This document describes _what_ the system does. For _how_ each capability is built — the persistent store and schema, the anchor-resolution chain, the two-layer render model and field watermarking, the drift inbox and bidirectional MCP writes, the authority-signal mechanics, the drift-triage sub-agent, the change-set and review machinery, the whole-repo zoom computation and agentic post-processing pipeline, and the realtime-channel approximations — see **task-27**.

See also: `vision.md`, `doc-4 — Useful Diagrams For Software Development`.
