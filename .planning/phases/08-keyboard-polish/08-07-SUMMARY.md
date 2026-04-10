---
phase: 08-keyboard-polish
plan: 07
subsystem: ui
tags: [keyboard-shortcuts, cmd-w, state-persistence, wizard, sidebar, first-run]

# Dependency graph
requires:
  - phase: 08-05
    provides: PTY exit detection via pane-death monitoring thread
  - phase: 08-01
    provides: Keyboard shortcut foundation (Ctrl+key handler)
  - phase: 08-03
    provides: First-run wizard flow
provides:
  - Cmd+W closes active tab instead of quitting app
  - Wizard exclusively owns zero-project first-run detection (no sidebar race)
  - AppState preserves project data through save/load cycles
affects: [09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Keyboard guard allows both Ctrl and Cmd modifiers; each case explicitly declares which modifier it requires"
    - "AppState.projects synced from signals before every save (saveAppState + beforeunload)"

key-files:
  created: []
  modified:
    - src/main.tsx
    - src-tauri/src/lib.rs
    - src/state-manager.ts
    - src/components/sidebar.tsx

key-decisions:
  - "Removed PredefinedMenuItem::close_window from native Window menu so JS handler intercepts Cmd+W before macOS"
  - "Sidebar no longer detects zero projects -- wizard in main.tsx initProjects() is the single authority for first-run"
  - "Projects synced into currentState on every save call, not just beforeunload, to prevent any save path from losing data"

patterns-established:
  - "Pattern: Keyboard handler guard allows both Ctrl and Cmd, each case self-documents its required modifier"
  - "Pattern: Signal data synced into persistence state before every save operation"

requirements-completed: [UX-04]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 08 Plan 07: Cmd+W, Wizard Race, State Persistence Summary

**Cmd+W closes tabs via JS handler (native accelerator removed), wizard exclusively owns first-run, AppState preserves project data through all save paths**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-10T07:58:32Z
- **Completed:** 2026-04-10T08:01:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Cmd+W now closes the active tab instead of quitting the app by removing native close_window menu item and intercepting in JS
- Keyboard handler guard changed from ctrlKey-only to Ctrl-or-Cmd, with each shortcut case explicitly declaring its required modifier
- Sidebar zero-project openProjectModal() removed -- wizard in main.tsx is the single authority for first-run flow
- AppState interface gains projects field; every save path (saveAppState, beforeunload) syncs projects signal before serializing
- loadAppState restores projects signal from persisted state and defaults missing field to empty array

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Cmd+W to close tab + remove native close_window accelerator** - `04506b5` (fix)
2. **Task 2: Fix wizard/sidebar race + state projects field** - `d277ac0` (fix)

## Files Created/Modified
- `src/main.tsx` - Keyboard guard allows Ctrl+Cmd, W case accepts either, all other cases explicit about e.ctrlKey
- `src-tauri/src/lib.rs` - Removed PredefinedMenuItem::close_window from Window menu
- `src/state-manager.ts` - Added projects to AppState interface, default state, save sync, load restore
- `src/components/sidebar.tsx` - Removed openProjectModal() from zero-project useEffect check

## Decisions Made
- Removed native close_window rather than trying to override it -- JS preventDefault cannot beat native menu accelerators on macOS
- Chose to sync projects on every saveAppState call (not just beforeunload) to guard against any save path losing data
- Sidebar keeps its project list loading (getProjects) but defers all modal/wizard decisions to main.tsx

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three UAT failures (tests 4, 10, 11) addressed
- Cmd+W closes tabs, wizard owns first-run, project data persists
- Ready for Phase 09 (Rich Dashboard Views)

## Self-Check: PASSED

All files exist, all commits found, all key code patterns verified:
- main.tsx: metaKey in guard (line 107), Cmd+W case (line 133)
- lib.rs: 0 occurrences of close_window
- state-manager.ts: projects field in interface, default, save sync, load restore
- sidebar.tsx: no openProjectModal in zero-project init path

---
*Phase: 08-keyboard-polish*
*Completed: 2026-04-10*
