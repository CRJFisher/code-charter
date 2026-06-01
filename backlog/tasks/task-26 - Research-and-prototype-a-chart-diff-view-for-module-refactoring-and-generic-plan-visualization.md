---
id: TASK-26
title: >-
  Research and prototype a chart-diff view for module refactoring and generic
  plan visualization
status: To Do
assignee: []
created_date: "2026-05-24 12:10"
labels: []
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

Once both 'Files' (the developer's actual file structure) and 'Clusters' (the semantic suggestion) views exist, the most useful signal is the gap between them: which symbols 'want to live' somewhere other than where they actually live. That gap is a refactoring guide.

The same abstraction has a second, larger purpose: plan visualization. When an AI agent proposes structural changes to a codebase ('move these three functions to a new auth module, delete this dead helper, add a wrapper around X'), code-charter should be able to render that proposal on the chart — including elements that don't yet exist in the source.

This task is intentionally scoped as research + design + a minimal prototype, not a shipped UI. The goal is to validate the data model and algorithm before committing to a visualization. A follow-up task will implement the in-chart rendering once the design is stable.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 A written design document lives in backlog/docs/ that defines the chart-diff data model, the partitioning-diff algorithm, and the generic-plan abstraction
- [ ] #2 Top-level type is ChartDiff with before and after ChartState fields; ChartState carries nodes, edges, and modules, each tagged with a Provenance discriminator (indexed | proposed) so agent-invented elements are first-class
- [ ] #3 Module-correspondence algorithm is specified: pairwise Jaccard between left and right module member sets, max-weight bipartite matching, classified into stable | renamed | merged | split | added | removed with documented thresholds
- [ ] #4 Per-symbol delta computation is specified: derived from the matched correspondences, classified as stayed | moved | added | removed
- [ ] #5 Design doc shows that the module-diff case reduces to a ChartDiff in which before.nodes and before.edges equal after.nodes and after.edges, and only modules differ — proving no special-casing is needed for this case
- [ ] #6 Design doc shows how an agent-authored plan reduces to a ChartDiff in which after contains nodes/edges/modules with provenance: proposed — proving the abstraction generalises
- [ ] #7 Visualization candidates are evaluated in the doc with a recommended primary (in-chart highlighting with proposed-move chevrons on affected symbols) and a recommended secondary (Sankey side-panel for bulk-movement overview); rejected candidates (side-by-side, dual badges, animated transition) are recorded with reasons
- [ ] #8 A prototype script (CLI under packages/cli or a colocated test) computes a ChartDiff between two stored cluster results for the same entrypoint and prints the resulting module correspondences and symbol deltas as JSON
- [ ] #9 The prototype demonstrates the Files-vs-Clusters case using real workspace data (no UI integration required)
- [ ] #10 Doc enumerates follow-up tasks needed to implement the in-chart diff visualization and the agent-plan ingestion path; this task does not include those implementations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. Confirm the data model proposed in the doc against the existing ClusterGraph and NodeGroup types (packages/types/src/backend.ts, packages/vscode/src/clustering/cluster_graph.ts) to ensure it composes with what is already shipped.
2. Draft the design doc in backlog/docs/ covering: ChartState shape with Provenance, ChartDiff before/after pair, PartitionDiff as the derived form (ModuleCorrespondence[], SymbolDelta[]), and the Jaccard + bipartite matching algorithm with thresholds (e.g. stable >=0.8, renamed 0.3-0.8, split/merge from residual overlap >=0.25).
3. In the same doc, walk through the two reductions: (a) module-diff between Files and Clusters partitionings of an identical NodeId set; (b) agent plan with proposed-provenance additions.
4. Evaluate visualization candidates: in-chart highlighting (primary, low cognitive load, action-oriented), Sankey side-panel (secondary, for shape-of-change overview), and rejected approaches (side-by-side, dual badges, animation). Record the reasoning so the follow-up implementation task starts from a decision, not a debate.
5. Build the prototype as a CLI subcommand (or a dedicated test entry point) that takes two stored cluster JSON paths and emits the diff JSON. Reuse the storage primitives already in place for cached clusters.
6. Run the prototype against a real workspace, capturing the output of Files-vs-Clusters for at least one entrypoint, and attach a sample to the doc as a worked example.
7. Enumerate concrete follow-up tasks: (a) implement the primary in-chart highlight visualization; (b) implement the Sankey side panel; (c) define the wire format for an agent to submit a plan; (d) integrate plan submission with the chart. Create those as future task drafts (or leave them captured in the doc for later promotion).
<!-- SECTION:PLAN:END -->

## Research Findings (prior art summary)

<!-- SECTION:RESEARCH:BEGIN -->

Distilled from a 20-agent literature + industry survey (academic graph-diff / dynamic-graph viz / partition comparison / community evolution / refactoring viz / architecture conformance / HCI for change preview / visual-comparison taxonomy; industry IDE refactor previews, AI agent change previews, codebase viz tools, architecture diagram tools, graph viz libraries, dependency analysis tools, git/PR viz, schema/data diff, design/canvas tools, OSS clustering libs).

### Algorithm — module correspondence

- Adopt **Greene, Doyle, Cunningham 2010** event framework (ASONAM): Jaccard on member sets + threshold filter + connected-components classification. Events: continue, merge, split, birth, death.
- **Do not use Hungarian / max-weight bipartite matching as the primary algorithm.** It forces 1-to-1 and structurally cannot represent split/merge. AC #3 should be revised: threshold-graph + connected-components, with Hungarian reserved for within-component tie-breaks if needed.
- Suggested thresholds (literature-backed defaults, all tunable):
  - Match threshold θ = **0.3** (Greene; range tested 0.1–0.5; lower = more permissive)
  - Stable vs renamed: continuation with Jaccard ≥ **0.8** + label/centroid drift below τ → stable; ≥ θ otherwise → renamed
  - Death after **d = 3** missed steps (irrelevant for static two-snapshot diff; collapse to single check)
- **Rename is not a first-class event in any surveyed framework** (Greene, Palla, GED/Bródka, MONIC, Asur). Implement as `continuation + label/centroid drift > τ`. Add to AC #3.
- Asymmetric option: **overlap coefficient** `|A∩B| / min(|A|,|B|)` when modules are heavily imbalanced (one is strict subset of another after a split). Jaccard penalizes this case unfairly.
- **Files-vs-Clusters case is set-difference, not graph matching** — nodes and edges are identical; only module assignment differs. Confirms AC #5: no GED, no graph isomorphism. The full machinery is needed only for the agent-plan case where nodes/edges genuinely change.
- Ready-made implementation: **CDlib** (BSD-2, Python) — `TemporalClustering` + `LifeCycle.compute_events(strategy="greene")` + `polytree()` covers the entire pipeline. Use as Python microservice or reimplement matching in TS (~50 LOC; the rest is JS-native set ops + connected components).
- Reference repo: github.com/derekgreene/dynamic-community (Apache-2.0).

### Visualization — primary view

- **Gleicher's design space**: juxtaposition / superposition / explicit encoding. For "spot which symbols moved between modules" (categorical-membership change), the literature converges on **explicit encoding (color halos) within a stable-layout single graph**, not side-by-side panels and not pure overlay.
- **Difference maps** (Archambault, Purchase, Pinaud 2011) — color nodes/edges as added (green) / removed (red) / unchanged (gray) — significantly outperform animation and plain small-multiples for change-counting accuracy. This is the empirically strongest primitive for the primary view.
- **Mental-map preservation** (Misue/Eades 1995): anchor layout from `before`; only newly-added nodes need placement. Already feasible because `elkjs` is in stack.
- **Animation is for orientation tasks, not change-counting.** If used at all, follow Heer-Robertson / GraphDiaries staged-transition pattern (fade-out removed → move stable → fade-in added, ~1s/stage). Cheaper alternative: highlight-then-dim (full saturation on changed, ~30% opacity on unchanged).
- **Provenance: proposed** styling — dashed border + ~50% opacity + distinct hue. Multiple converging sources (Sulír 2018 IDE augmentation taxonomy, Ferdowsi 2024 Leap, Copilot Edits squared-dot badge).
- Confirm primary recommendation in AC #7 (in-chart highlighting with chevrons) is consistent with the literature: yes, with the addition of difference-map color encoding and stable-layout anchoring.

### Visualization — secondary (Sankey side-panel)

- d3-sankey (WOLF crossing heuristic) viable up to ~15 modules per side. Above ~30 modules: switch to a matrix view (MatrixWave, CHI 2015 beat Sankey on path tasks).
- For module-count beyond the Sankey limit, prefer parallel sets (Bendix/Kosara) or hierarchical drill-down.
- Confirm AC #7 secondary recommendation: yes, with a stated scale cutoff.

### Visualization — rejected candidates (with literature backing)

- **Side-by-side / juxtaposition**: rejected because module layouts differ between partitionings — eye-tracking across panels is cognitively expensive. (Archambault 2011 — faster but less accurate on change-detection sub-tasks.)
- **Dual badges**: insufficient signal density; not preattentive.
- **Animated transition**: better for orientation tasks (find a specific node) than for change-counting (Archambault 2011). For a deliberately reviewed before/after, static color encoding wins. Keep animation available as an optional toggle.
- **Pure superposition** (no color): clutter dominates above ~50 nodes.

### Industry/OSS reality check

- **No shipped tool today visualizes structural code changes as a graph diff.** Verified across IDEs (IntelliJ, VS Code, Eclipse, VS, ReSharper — all text-list previews), AI coding tools (Cursor, Copilot Edits/Workspace, Claude Code, Aider, Cody, Devin, Replit, v0, Lovable, Bolt — all text diff + ghost text), codebase viz tools (Structure101, NDepend, SciTools, CodeSee, AppMap, CodeScene — all version-compare but no proposed-overlay), architecture diagram tools (Figma branching, Lucidchart, Structurizr, IcePanel — version-compare, no graph-level proposed-state). **The gap is real; this is a novel contribution.**
- Strongest UX patterns to steal:
  - Copilot Edits 3-tier accept/reject (per-change / per-file / all) → map to per-node / per-module / whole-plan.
  - Devin Review move-detection (show as move, not delete+add).
  - SemanticDiff paired-color move encoding (same color at old + new position).
  - Figma branching opacity-slider overlay (optional toggle, not primary).
  - Fly-to-next-change navigation — universally missing in all surveyed tools.
- Cautionary findings:
  - Murphy-Hill 2009: refactoring tools see ~10% adoption when correct — UX flow is the bottleneck, not algorithm quality.
  - Knodel 2015: violation detection alone does not lead to violation removal. UI must be action-oriented (suggest move; let user execute), not observation-oriented.
  - 2025 agentic-PR study (arXiv:2602.04226): 67.9% of rejected AI PRs got no explicit feedback. Per-proposal rationale is required, not optional.
  - Bulk-only merge (Figma branching) is the most-cited failure mode — code graphs need per-element accept.

### Stack notes

- React Flow stays. Diff is a data-layer concern: add `diffStatus: 'added' | 'removed' | 'modified' | 'moved' | undefined` and `provenance: 'indexed' | 'proposed'` to node/edge data; extend custom node components in `packages/ui/src/components/code_chart_area/chart_node_types.tsx` to render status-aware styling.
- React Flow scale limit: ~500 nodes with animated diffs. If code-charter targets larger graphs, switch path is Cytoscape.js (canvas) or Sigma.js (WebGL).
- `elkjs` already in stack — pin "before" node positions, only lay out "after"-only nodes.

### Suggested AC amendments

- AC #3: replace "max-weight bipartite matching" with "threshold-graph + connected-components (Greene 2010)"; add rename as `continuation + centroid drift > τ`.
- AC #7: add difference-map color encoding (green/red/gray) as the concrete primitive under "in-chart highlighting"; add stated scale cutoff (~15 modules) for the Sankey secondary, with matrix-view fallback above that.

### Key citations

- Greene, Doyle, Cunningham 2010 — _Tracking the Evolution of Communities in Dynamic Social Networks_ (ASONAM). Event taxonomy + matching algorithm.
- Gleicher et al. 2011 / Gleicher 2018 — _Visual Comparison for Information Visualization_ (IV / IEEE TVCG). Design-space framework.
- Archambault, Purchase, Pinaud 2011 — _Difference Map Readability for Dynamic Graphs_ (GD/LNCS) and _Animation, Small Multiples, and the Effect of Mental Map Preservation_ (IEEE TVCG 17(4)).
- Heer, Robertson 2007 — _Animated Transitions in Statistical Data Graphics_ (IEEE InfoVis). Staging principles.
- Murphy, Notkin, Sullivan 1995/2001 — Reflexion model. Convergence/divergence/absence taxonomy for architecture-vs-source gap.
- Knodel, Popescu 2007 — _Comparison of Static Architecture Compliance Checking Approaches_ (WICSA).
- Horvitz 1999 — _Principles of Mixed-Initiative User Interfaces_ (CHI). Accept/reject granularity principles.
- Murphy-Hill, Parnin, Black 2009 — _How We Refactor, and How We Know It_ (ICSE). 10% adoption finding.

<!-- SECTION:RESEARCH:END -->
