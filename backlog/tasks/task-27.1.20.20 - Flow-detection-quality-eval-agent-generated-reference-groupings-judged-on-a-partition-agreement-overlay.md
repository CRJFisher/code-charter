---
id: TASK-27.1.20.20
title: >-
  Flow-detection quality eval: agent-generated reference groupings judged on a
  partition-agreement overlay
status: To Do
assignee: []
created_date: "2026-07-09 16:57"
labels:
  - drift
  - eval
  - dx
  - ui
dependencies:
  - TASK-27.1.20.16
  - TASK-27.1.20.17
  - TASK-27.1.20.19
references:
  - >-
    backlog/tasks/task-26 -
    Research-and-prototype-a-chart-diff-view-for-module-refactoring-and-generic-plan-visualization.md
parent_task_id: TASK-27.1.20
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Task .19 grades **drift action-correctness** — code changed, did the mechanism respond rightly (right flow retired, members re-anchored, user layer preserved)? — a _delta_ judgement shown as task-26's difference map. This task grades the other half of the mechanism: **flow-detection quality** — independent of any code change, is the initial grouping of the graph into logical flows a good one? That is an _absolute_ judgement with no before/after, so the difference-map grammar does not apply and this task does not reuse it.

The core move is **independent ground truth**. Grading detection quality by asking the human to bless what the detector already produced invites cheap agreement bias. Instead, a research agent (opus, own repo exploration) independently derives candidate logical flow groupings for the subject repo — what the flows _should_ be — forming a reference the detector's output is compared against. Because "the right grouping" is genuinely under-determined, the agent is sampled several times and the signal is **detector-vs-consensus**; alternate groupings are preserved as rationale rather than discarded.

The agent's grouping is a fallible LLM opinion, not gold. Treating detector/agent disagreement as a "miss" would measure LLM-agreement, not correctness — so the reference carries the same discipline as .19 AC#2: it is recorded as a screening/ranking signal with `grader: judge`, never as a human golden, and a human adjudicates every disagreement before any verdict lands.

The visualisation is **not** two full diagrams side-by-side — that carries the exact mental-map / eye-saccade cost task-26 argues against, and clustering disagreement is hard to spot across two diagrams (which node moved to which flow?). Detector-grouping vs reference-grouping is a **partition (clustering) diff**, not the add/remove/modify edit diff task-26's difference map encodes. So it gets its own encoding — a **partition-agreement overlay**: one stable-layout graph, nodes encoded by agreement (neutral where detector and reference agree on a node's flow, haloed where they disagree). This applies task-26's "single anchored graph, explicit encoding" philosophy to partitions rather than edits.

Reuse is at the **surface**, not the schema: this rides on .19's webview plumbing (salient spine sidebar per .16, judge/verdict panel) and writes verdicts through the same pinned grades contract as the CLI queue (.17 AC#5). But a partition-agreement overlay is a distinct encoding from a before/after edit diff, so this is a **third surface consumer, not a third ChartDiff consumer** — reuse the panel and the grades contract, not task-26's edit-diff data model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 An independent reference agent derives candidate logical flow groupings from its own research over the subject repo; the agent is sampled a configurable number of times and its cost per run is recorded
- [ ] #2 The detector's grouping is compared against the sampled reference as a partition-agreement signal (which nodes each source assigns to which flow), and the human queue is ranked by detector-vs-consensus disagreement
- [ ] #3 The agent-derived reference is recorded with grader: judge so it never masquerades as a human golden; alternate groupings are preserved as rationale, and a human adjudicates every disagreement before a verdict lands
- [ ] #4 Each case renders a partition-agreement overlay: a single stable-layout flow graph with nodes explicitly encoded by agreement (neutral where detector and reference agree on a node's flow, haloed where they disagree) — never two full diagrams side-by-side and never raw JSON
- [ ] #5 The plain after-state flow (no agreement encoding) is available as a toggle for judging representation quality on its own terms
- [ ] #6 The surface reuses .19's webview plumbing (salient spine sidebar per .16, judge/verdict panel) and writes verdicts through the same pinned grades contract as the CLI queue (.17 AC#5); this is a third surface consumer, not a third ChartDiff/edit-diff schema consumer

<!-- AC:END -->
