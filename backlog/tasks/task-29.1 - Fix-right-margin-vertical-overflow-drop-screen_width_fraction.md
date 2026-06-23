---
id: TASK-29.1
title: Fix right margin + vertical overflow (drop screen_width_fraction)
status: To Do
assignee: []
created_date: "2026-06-23 02:22"
labels:
  - ui
  - bug
  - confirmed
dependencies: []
parent_task_id: TASK-29
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->

CONFIRMED (verified high-confidence). A large empty margin appears on the right of the chart, and the chart slightly overflows under the header bar.

Root cause: .chart-container is sized to a hardcoded width: `${screen_width_fraction * 100}%` (= 80%, screen_width_fraction hardcoded to 0.8 at app.tsx:68) of a flex parent that is ALREADY correctly sized by flexbox to the space left after the w-1/4 sidebar (~75% of viewport). 80% of ~75% = ~60%; sidebar 25% + chart 60% leaves ~15% empty on the right. The same inline styles also set height: 100vh inside a row that sits below the header (app.tsx p-2 border-b), so the chart is taller than its slot (vertical overflow). fitView padding (0.2) is NOT the cause — it insets content symmetrically inside the canvas.

<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->

- [ ] #1 code_chart_area.tsx :266, :288, :311 use width: "100%" instead of ${screen_width_fraction \* 100}%
- [ ] #2 code_chart_area.tsx :267 and the matching height in the empty/main blocks use height: "100%" instead of "100vh"
- [ ] #3 screen_width_fraction prop is removed from CodeChartAreaProps (code_chart_area.tsx:45) and its pass-through screen_width_fraction={0.8} at app.tsx:68 is deleted (no default of 1.0 — delete per no-backwards-compat/YAGNI)
- [ ] #4 Chart fills the full width beside the sidebar with no right margin and no vertical overflow under the header
- [ ] #5 All existing tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. In code_chart_area.tsx change the three inline width: `${screen_width_fraction * 100}%` to width: "100%" (loading :266, empty :288, main :311).
2. Change the three height: "100vh" to height: "100%" in the same three style blocks.
3. Remove screen_width_fraction from CodeChartAreaProps (:45) and delete the pass-through at app.tsx:68.
4. Verify no other consumers of screen_width_fraction remain (grep).
<!-- SECTION:PLAN:END -->
