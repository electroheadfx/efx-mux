---
status: investigating
trigger: "3-split visibility: data persists but 3rd split pushed outside app window on launch"
created: 2026-04-20
updated: 2026-04-20
---

# Debug: 3-Split Visibility - 3rd Pane Off-Screen

## Symptoms

- **Expected behavior:** All 3 splits visible in main panel after restore
- **Actual behavior:** Only first 2 splits visible, 3rd pushed outside window
- **Error messages:** None
- **Timeline:** Phase 22 UAT - persistence works but layout broken
- **Reproduction:** Create 3 splits, quit, restart app

## Suspected Root Causes

1. CSS vars for split ratios not applied before render
2. Flex calculation issue - first 2 panes consume all space
3. Even-default calculation wrong for 3 panes
4. Height calculation uses stale values

## Focus Files

- `src/components/sub-scope-pane.tsx` - restoreActiveSubScopes CSS var logic
- `src/components/main-panel.tsx` - MainPanel flex layout

## Current Focus

- hypothesis: null
- test: null
- expecting: null
- next_action: check CSS var application timing and flex calc for 3 panes
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

(none yet)

## Eliminated

(none yet)

## Resolution

- root_cause: null
- fix: null
- verification: null
- files_changed: []
