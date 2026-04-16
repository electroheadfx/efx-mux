---
phase: 17-main-panel-file-tabs
plan: 04
subsystem: ui
tags: [drag-and-drop, dropdown-menu, tab-bar, preact, signals]

# Dependency graph
requires:
  - phase: 17-main-panel-file-tabs
    provides: unified-tab-bar with DnD, dropdown menu, right panel, sidebar Git tab
provides:
  - Fixed drag-and-drop reorder for all tab types (terminal, editor, git-changes)
  - Click-safe dropdown menu items via pointerEvents isolation
  - Right panel reduced to File Tree and GSD tabs (Diff removed)
  - Sidebar Git file clicks open Git Changes tab in main panel
affects: [right-panel, sidebar, unified-tab-bar, dropdown-menu]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pointerEvents none on interactive child elements to prevent click interception"
    - "Full tab order (all types) in getOrderedTabs instead of type-based partitioning"

key-files:
  created: []
  modified:
    - src/components/unified-tab-bar.tsx
    - src/components/dropdown-menu.tsx
    - src/components/right-panel.tsx
    - src/components/sidebar.tsx

key-decisions:
  - "Tab order now includes all tab types (terminals, editors, git-changes) in a single flat order"
  - "Removed Diff tab from right panel -- diff viewing is now exclusively in main panel Git Changes tab"

patterns-established:
  - "pointerEvents none on icon/label children inside clickable menu items"
  - "getOrderedTabs returns a single sorted list of all tab types by tabOrder position"

requirements-completed: [EDIT-05, MAIN-01, MAIN-02]

# Metrics
duration: 2min
completed: 2026-04-15
---

# Phase 17 Plan 04: UAT Gap Closure (DnD, Dropdown, Diff Tab) Summary

**Fixed tab drag-and-drop reorder for all tab types, dropdown menu click interception, removed redundant Diff tab from right panel, and wired sidebar Git clicks to main panel Git Changes tab**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-15T16:46:22Z
- **Completed:** 2026-04-15T16:48:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Drag-and-drop tab reorder now works for all tab types (terminal, editor, git-changes) by operating on the full ordered tab list instead of only non-terminal tabs
- Dropdown menu clicks always fire the correct item action by adding pointerEvents:none to icon and label elements, preventing child element click interception
- Right panel reduced from 3 tabs (File Tree, GSD, Diff) to 2 tabs (File Tree, GSD) with DiffViewer completely removed
- Sidebar Git file row clicks now open the Git Changes tab in the main panel instead of switching to the (now removed) Diff tab in the right panel

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix drag-and-drop tab reorder and dropdown menu click** - `607bba9` (fix)
2. **Task 2: Remove Diff tab from right panel and rewire sidebar Git clicks** - `4acb31b` (fix)

## Files Created/Modified
- `src/components/unified-tab-bar.tsx` - Fixed getOrderedTabs to sort all tabs by tabOrder; handleDrop operates on full ordered list via allIds
- `src/components/dropdown-menu.tsx` - Added pointerEvents:none to icon and label span elements in menu items
- `src/components/right-panel.tsx` - Removed DiffViewer import/render, open-diff event listener, reduced RIGHT_TOP_TABS to ['File Tree', 'GSD'], added persisted Diff tab fallback guard
- `src/components/sidebar.tsx` - Imported openGitChangesTab, changed GitFileRow onClick from open-diff CustomEvent dispatch to openGitChangesTab() call

## Decisions Made
- Tab order now includes all tab types in a single flat list. The previous approach partitioned terminals (always first) from non-terminals (sorted by tabOrder). This partitioning meant terminal tabs could never be reordered via drag-and-drop since they were not in tabOrder. The new approach puts all tab IDs in tabOrder, enabling full reorder flexibility.
- Removed Diff tab entirely from right panel rather than hiding it. The Git Changes tab in the main panel provides the same diff functionality in a better location.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT gaps 1, 3, and 5 are now closed
- Right panel is streamlined to 2 tabs
- Sidebar Git integration properly routes to main panel

---
*Phase: 17-main-panel-file-tabs*
*Completed: 2026-04-15*
