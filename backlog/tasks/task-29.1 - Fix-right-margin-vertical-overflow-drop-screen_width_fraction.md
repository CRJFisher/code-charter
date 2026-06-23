---
id: TASK-29.1
title: Fix right margin + vertical overflow (drop screen_width_fraction)
status: Done
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

- [x] #1 code_chart_area.tsx :266, :288, :311 use width: "100%" instead of ${screen_width_fraction \* 100}%
- [x] #2 code_chart_area.tsx :267 and the matching height in the empty/main blocks use height: "100%" instead of "100vh"
- [x] #3 screen_width_fraction prop is removed from CodeChartAreaProps (code_chart_area.tsx:45) and its pass-through screen_width_fraction={0.8} at app.tsx:68 is deleted (no default of 1.0 — delete per no-backwards-compat/YAGNI)
- [x] #4 Chart fills the full width beside the sidebar with no right margin and no vertical overflow under the header
- [x] #5 All existing tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->

1. In code_chart_area.tsx change the three inline width: `${screen_width_fraction * 100}%` to width: "100%" (loading :266, empty :288, main :311).
2. Change the three height: "100vh" to height: "100%" in the same three style blocks.
3. Remove screen_width_fraction from CodeChartAreaProps (:45) and delete the pass-through at app.tsx:68.
4. Verify no other consumers of screen_width_fraction remain (grep).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

## High-level summary

The chart now fills its flex slot beside the sidebar with no empty right margin and sits entirely below the header bar with no vertical overflow. The fix removes the redundant manual sizing that fought the layout: `.chart-container` has no CSS rules, so its size came entirely from inline styles that hardcoded `width: ${screen_width_fraction * 100}%` (80%) and `height: 100vh`. Both overrode a parent that flexbox already sizes correctly. The container now uses `width: 100%` / `height: 100%`, and the `screen_width_fraction` prop is gone entirely.

### What changed

- `code_chart_area.tsx` — the three `chart-container` style blocks (loading, empty, and main render paths) use `width: "100%"` and `height: "100%"` in place of `${screen_width_fraction * 100}%` / `100vh`.
- `code_chart_area.tsx` — `screen_width_fraction` removed from `CodeChartAreaProps` and from the component's destructured props.
- `app.tsx` — the `screen_width_fraction={0.8}` pass-through is deleted. No default is reintroduced (per no-back-compat / YAGNI).

### Why this is the root cause

`.chart-container` lives inside `<div className="flex flex-1 bg-vscodeBg">`, which flexbox already sizes to the space beside the `w-1/4` sidebar. Forcing `width: 80%` of that already-correct slot left ~15% empty on the right; `height: 100vh` made the chart full-viewport-tall inside a row that sits *below* the `p-2 border-b` header, causing the overflow. `width/height: 100%` lets the chart fill exactly its flex slot.

The `height: 100%` chain resolves correctly: root `flex flex-col h-screen` → body row `flex flex-1` → wrapper `flex flex-1 bg-vscodeBg` (stretched to full row height) → `chart-container` `height: 100%`. The inner content wrapper already used `width/height: 100%`, so the container sizing is now consistent throughout.

### Verification

- `tsc --noEmit` clean — confirms no dangling `screen_width_fraction` references after the prop removal.
- All 17 UI test suites pass (164 tests). No test referenced the removed prop or the component, so the removal broke nothing.

<!-- SECTION:NOTES:END -->
