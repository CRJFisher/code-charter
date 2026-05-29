---
id: doc-5
title: Diagram-Driven Development — Capstone Architecture
type: architecture
created_date: "2026-05-28 00:00"
---

# Diagram-Driven Development — Capstone Architecture

## The vision in one sentence

A code-charter diagram is a **layered, queryable statement of intent** where user customizations are immortal, drift between code and diagram lives in an inbox, and authority over each part of the system is **inferred from where the user keeps editing**.

> _The capstone is the unit of delivery; task-21 was the investigation route that led here. The mental shift: from "linkage as MCP server" to "diagram as intent surface."_

## The diagram as peer artifact

The diagram is not a viewing aid for code. It is a **high-level artifact that sits above the code at architectural scale**, kept consistent with it by two-way syncing. Code captures _how_; the diagram captures _what_ and _why_. Both are first-class — neither is derived. The five framings below are the mechanism that lets two artifacts at different levels of abstraction stay coherent without either losing its voice.

## The architecture at a glance

```
code + docs
    │
    ▼
extractors  ──►  extractor layer (disposable)
                          │
user edits  ──►  user layer (immortal, anchored)
                          │
                          ▼
                       render()
                          │
                          ▼
                       diagram  ◄──  user / agent edits
                          │                │
                          ▼                ▼
                    drift inbox      intent signals      pending edits
                    (code → diagram) (authority)         (diagram → code)
                          │                │                  │
                          └────────────────┴──────────────────┘
                                           │
                            SessionStart · UserPromptSubmit · PreCommit
                                  /drift walkthrough (side-by-side)
```

Three queues, one diagram, three hooks, one slash command. The two named sync writes — `drift.resolve` (code → diagram) and `diagram.propose` (diagram → code) — are the bidirectional MCP plumbing; both directions are explicit, neither relies on the renderer to figure things out. `user_layer.update` is the escape hatch for agent-driven edits outside the drift loop. (Vertical layout is data flow, not derivation — both layers and the diagram are peer artifacts.)

## The five framings

### 1. The diagram is composed of two layers

```
diagram = render(extractor_layer + user_layer)
```

The **extractor layer** is disposable, rebuilt from code+docs on every change. The **user layer** is immortal, append-only — labels, descriptions, group memberships, layout pins, manual edges. Re-extraction never touches it.

User fields are watermarked at field granularity: `label`, `description`, `color`, `group`, `hidden`, `position`. Structural fields stay extractor-owned.

### 2. Anchors, not IDs

User edits attach by stable resolvers, not by brittle node ids:

```
symbol_path  →  content_hash  →  rename detection  →  orphan_quarantine
```

When a resolver downgrades (content_hash miss, rename detected, orphaned), an entry lands in the drift inbox. If every resolver fails, the edit moves to a quarantine bin with full context. **Customizations are never auto-deleted.**

### 3. Drift is an inbox, not an alarm

When code or docs change, the system records _observations_ — not _events_:

- Hooks INSERT drift rows; never block mid-edit.
- Items run `open → triaged → resolved | dismissed | auto-archived(180d)`. (The symmetric diagram→code queue — pending edits — is described in framing 5.)
- Scoped by **Ariadne graph-proximity** so silence-by-default stays tolerable.
- Surfaced at session start, in `/drift`, or as an ambient status-line count — never inline.
- One blocking exception: a pre-commit gate when high-severity drift touches files in the commit.

### 4. Authority is observed, not declared

Every edge carries `last_intent_source` (code-edit | diagram-edit | explicit-pin) and a timestamp. Authority is **inferred from where intent keeps landing**.

- Diagram edits to extractor-relevant fields (label, group, hidden) claim diagram-intent.
- Code edits to diagram-relevant aspects (signature, name, imports, structural edges) claim code-intent.
- Edits that don't affect extractor output make no claim.
- Agent edits executing a prior pin are _derivative_ — marked, not authority-resetting.

A cosmetic-vs-intent classifier — run by the drift triage sub-agent — handles easy cases unilaterally (description = cosmetic; identifier-shaped rename = intent); the fuzzy middle (cluster rename mapping to a directory) prompts the user.

Explicit `pin` is the override: claim diagram-authority over a boundary _before_ code drifts into it.

### 5. The agent triages, the user adjudicates

When drift is detected the agent reads the diff and decides blast radius. A no-op stays silent; a minor change auto-resolves; a major architectural change escalates to the user at the next appropriate moment.

Both sync directions have explicit MCP plumbing:

- **Code → diagram** — when extractors detect divergence from the user layer's anchors, the agent calls `drift.resolve(id, ...)` to write the chosen resolution back: re-anchor an orphaned description, rewrite prose referencing a stale name, prune an orphan, adjudicate a fuzzy conflict. `user_layer.update(node_id, field, value)` is the general escape hatch for agent-driven edits outside the drift loop.
- **Diagram → code** — `diagram.propose` queues a structured op (rename / delete / group); the agent applies it to code with preview-and-confirm. **Add** is the exception — a bare node has no spec, so add opens a prompt panel that becomes a normal coding task.

The agent owns triage. The user owns architectural decisions. _What counts as "the next appropriate moment"_ is the central UX problem — see open question.

## The constraint: trust

One constraint drives every mechanism above: **one lost customization ends adoption.** Three nightmare scenarios:

- _Rename eats the description_ — a refactor silently destroys a hand-written sentence.
- _Schema migration orphans a cluster_ — a bulk move detaches dozens of user labels at once.
- _Agent loop overwrites a pin_ — an autonomous edit reverts a deliberate architectural decision.

The engineered response:

- No destructive operations — soft-delete with restore.
- Triple persistence: SQLite WAL + hourly snapshots + git-tracked JSON sidecars.
- Orphans live forever in a re-anchoring bin.

## The MVP — first beachhead

Rename `render_diagram` to `render_mermaid` in the `skill-diagrammer` skill. Open Claude Code. SessionStart prints `1 drifted node in scripts/render.py`. Open the code-charter UI. Orange badge on the renamed node. Click Accept.

The hand-written description — _"Entry point for SVG output — called by the skill's post-tool-use hook"_ — snaps onto the new node, untouched.

A human sentence surviving a refactor without anyone re-typing it — the entire pitch. This proves the persistence and anchor mechanisms (framings 1–2) and touches inbox surfacing (3) and the triage path (5); authority signals (4) and the full inbox lifecycle demo in subsequent slices.

## The hardest open question

**When is the right moment to surface drift to the user?**

The ideal is a realtime two-way channel — user edits the diagram, agent receives it, resolution is interactive. Today's Claude Code primitives (MCP tools the agent calls; lifecycle hooks that can shell out) do not support unsolicited push into a running turn. Two approximations:

- **MCP-tool-as-long-poll** — the agent parks in `await_user_edit`; the MCP server blocks until the UI pushes (via SSE / long-poll), then returns. Requires the agent voluntarily parked in that tool call, not interrupted from idle.
- **`FileChanged` / `Stop` hook + headless re-invoke** — when the agent isn't parked, a hook shells out (`claude -p "<event>"`) to start a fresh turn carrying the event as input.

The architecture falls back to batched surfaces:

| Surface              | Trigger                  | Role                               |
| -------------------- | ------------------------ | ---------------------------------- |
| SessionStart banner  | session begin            | punch list                         |
| UserPromptSubmit     | prompt mentions a file   | one-line scoped nudge              |
| `/drift` walkthrough | user-invoked             | side-by-side diff resolver         |
| Pending-edits review | `diagram.propose` queued | preview-and-confirm for queued ops |
| PreCommit gate       | `git commit`             | blocking ack for high-sev          |

When a realtime channel arrives, the inbox becomes an event stream and the walkthrough becomes continuous.

## Alternatives considered

- **Three-way merge (BASE + LOCAL + REMOTE).** Rejected as substrate: user intent isn't textual, so renames break line-based merge. Worth layering on top when conflicts arise — not the foundation.
- **Full inversion (diagram as source of truth, code generated).** Rejected: round-tripping arbitrary code is the unsolved UML tomb. `pin` gives selective inversion without the round-trip burden.
- **Declarative authority (user marks fields as "mine").** Rejected in favor of observation: zero ceremony, no upfront cost, learns from where edits actually land.
- **Asymmetric writes (code → diagram implicit in the renderer).** Rejected: hides the authority decision inside extraction. Both directions get named MCP tools (`drift.resolve`, `diagram.propose`) so resolution is auditable and agent-callable.

## Why this is the capstone

Three long-standing limits stop being separate problems:

- **Ariadne gaps** — the agent writes its discoveries into the user layer, anchored stably. Gaps become first-class user-authored knowledge instead of silent omissions.
- **Fragile customizations** — immortal by construction, not by careful coding.
- **Read-only diagrams** — authority-by-observation + pin-as-override turns the diagram into an authoring surface without a big-bang commitment.

With those resolved, the diagram earns its standing as a peer artifact above the code. Customizations survive code change, authority is bidirectional, and consistency is enforced by named MCP writes in both directions. **Diagram-driven development moves from CASE-tool fantasy to a working architecture where code and diagram coexist as peer artifacts at different levels of abstraction.**

## The implementation tree

This capstone is the parent unit. Task-21 was the route here — the MCP / skill / hooks investigation that surfaced the need for a unified intent model — not itself on the critical path. Existing task-21 sub-tasks contribute where they fit, re-scoped as needed.

Targeting Claude Code + Cursor as primary hosts (OpenCode, Codex, Gemini deferred).

- Persistent graph store — foundation (existing task-21.1)
- Skill diagram v1 — first concrete render (existing task-21.2)
- Overlay layer + watermarking + orphan quarantine
- Drift inbox + `drift.resolve` / `user_layer.update` MCP writes + SessionStart / UserPromptSubmit hooks + relevance scoring
- Authority signals + pin override + `diagram.propose` queue + drift-triage sub-agent

Schema additions (overlay_layer, alias_history, split_of / merged_into, per-attribute confidence, referenced_span_hash) belong to specific work units above.

See also: `vision.md`, `doc-4 — Useful Diagrams For Software Development`.
