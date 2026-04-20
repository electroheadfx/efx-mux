---
status: complete
phase: quick-260416-imb
plan: 01
subsystem: ui/tab-bar
tags: [bug-fix, tab-management, signals]
dependency_graph:
  requires: []
  provides: [reliable-tab-close-selection]
  affects: [unified-tab-bar]
tech_stack:
  added: []
  patterns: [signal-ordering-before-removal]
key_files:
  created: []
  modified:
    - src/components/unified-tab-bar.tsx
decisions:
  - Move switchToAdjacentTab before closeTab to preserve tab position lookup
  - Add !currentTab guard in subscriber for belt-and-suspenders robustness
metrics:
  duration: 93s
  completed: 2026-04-16T11:29:37Z
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Quick Task 260416-imb: Fix tab bar selection not updating on tab close

Fixed closeUnifiedTab so the blue underline always follows the content switch after closing any main window tab.

## One-liner

Fix signal ordering in closeUnifiedTab so switchToAdjacentTab runs before closeTab removes the tab from allTabs

## Changes Made

### Task 1: Fix activeUnifiedTabId not updating on terminal tab close

**Part A -- Fix terminal close branches:**
Reordered operations in both the agent `onConfirm` callback and the non-agent close path:
1. `switchToAdjacentTab(tabId)` now runs FIRST (only when closed tab is active) -- needs tab still in `getOrderedTabs()` to find the adjacent tab
2. `setProjectTabOrder` removes the tab from the order list
3. `closeTab` handles PTY cleanup and terminal-level signals

Previously, `closeTab` ran first, removing the tab from `allTabs` before `switchToAdjacentTab` could determine the adjacent tab. And `switchToAdjacentTab` was only called when `terminalTabs.value.length === 0` (last terminal), not for all terminal closures.

**Part B -- Fix activeTabId subscriber guard:**
Changed the guard from `currentTab?.type === 'terminal'` to `!currentTab || currentTab.type === 'terminal'`. When `currentTab` is undefined (because the tab was already removed from `allTabs`), the subscriber now allows the sync instead of blocking it.

**Commit:** 50cf634

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- TypeScript compiles without errors (pnpm exec tsc --noEmit: clean)
- Checkpoint auto-approved (auto mode active)

## Self-Check: PASSED
