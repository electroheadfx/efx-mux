---
status: resolved
trigger: 3-split visibility bug - data persists correctly but 3rd split is pushed outside app window on launch
created: 2026-04-20
updated: 2026-04-20
---

# Debug Session: 3-split-visibility-bug

## Symptoms

- **Expected**: All 3 splits visible on app launch after persistence
- **Actual**: 3rd split pushed outside app window, only first 2 splits visible
- **Error messages**: None observed
- **Timeline**: After 3-split persistence was implemented in Phase 22
- **Reproduction**: Create 3 splits, quit app, relaunch

## Current Focus

- hypothesis: CONFIRMED - stale persisted ratios from 2-scope config applied to 3-scope layout
- test: Create 3 splits, quit, relaunch
- expecting: All 3 panes visible with even distribution
- next_action: User verification

## Root Cause

When user had 2 scopes with 60%/40% split, only `main-split-0-pct` was persisted.
After adding 3rd scope, `spawnSubScopeForZone` set CSS vars to 33.3% but didn't persist.
On restore: pane 0 = 60% (stale), pane 1 = 33.3% (default) = 93.3% → pane 2 pushed offscreen.

## Fix Applied

1. `restoreActiveSubScopes`: Now validates persisted ratio COUNT matches expected (total - 1).
   If count mismatches (stale data), keeps even defaults instead of applying partial ratios.

2. `spawnSubScopeForZone`: Now persists even ratios when adding a scope, so restore finds matching count.

## Evidence

- Line 229: `if (persistedRatios.length === expectedCount && totalPersisted > 0 && totalPersisted < 90)`
- Line 69-72: Added `ratioUpdates` persistence in spawnSubScopeForZone

## Eliminated
