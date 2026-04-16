---
phase: quick-260416-idw
plan: 01
subsystem: ui/tabs
tags: [styling, visual-consistency, tabs, underline]
dependency_graph:
  requires: [tokens.ts]
  provides: [underline-tab-bars]
  affects: [unified-tab-bar.tsx, tab-bar.tsx]
tech_stack:
  patterns: [bottom-underline-tabs, sidebar-TabRow-consistency]
key_files:
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/tab-bar.tsx
decisions:
  - Matched sidebar TabRow pattern exactly (fontSize 11, fontWeight 600, accent color, marginBottom -1)
metrics:
  duration: 57s
  completed: "2026-04-16T11:17:42Z"
---

# Quick Task 260416-idw: Restyle Main Window Tabs to Bottom Blue Underline

Replaced pill/elevated background tab style with 2px blue accent underline on both UnifiedTabBar and TabBar, matching the sidebar TabRow pattern from Phase 16.

## What Changed

### Task 1: Restyle UnifiedTabBar and TabBar to bottom blue underline (3429720)

**unified-tab-bar.tsx:**
- Added `spacing` to imports from tokens
- Removed `gap-1` from container class for zero-gap tab layout
- Replaced pill styles (bgElevated, border, borderRadius) with underline styles
- Active tab: `borderBottom: 2px solid accent`, transparent background, no border
- Inactive tab: `borderBottom: 2px solid transparent`
- Font size 13 -> 11, weight 500 -> 600 (active), color textDim -> textMuted (inactive)
- Added `marginBottom: -1` for underline overlap with container border

**tab-bar.tsx:**
- Added `spacing` to imports from tokens
- Removed `gap-1` from container class
- Same pill-to-underline style replacement as unified-tab-bar
- Padding changed from `9px 16px` to `${spacing.xl}px ${spacing['3xl']}px` (8px 12px)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Verification

- TypeScript compilation: PASSED (zero errors)
- Both components use identical underline pattern to sidebar TabRow
- No behavioral changes: event handlers, drag-and-drop, close buttons all untouched

## Commits

| Task | Commit  | Description                                           |
|------|---------|-------------------------------------------------------|
| 1    | 3429720 | Restyle tab bars from pill to bottom blue underline   |

## Self-Check: PASSED
