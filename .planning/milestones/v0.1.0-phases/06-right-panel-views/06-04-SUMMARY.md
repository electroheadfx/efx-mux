---
phase: 06-right-panel-views
plan: "04"
subsystem: ui
tags: [tauri, arrow-js, xterm, state-persistence, pty]

requires:
  - phase: 06-right-panel-views/03
    provides: "Right panel components, tab bar, bash terminal shell"
provides:
  - "Project mutations persist to disk via Rust save_state_sync"
  - "JS state reloads from Rust after project mutations (no stale overwrites)"
  - "Bash terminal connects via getElementById instead of broken Arrow.js ref"
affects: [06-right-panel-views]

tech-stack:
  added: []
  patterns:
    - "Rust-side persistence: clone state under lock, drop lock, spawn_blocking save"
    - "Arrow.js DOM discovery: setTimeout + getElementById instead of ref callbacks"

key-files:
  created: []
  modified:
    - src-tauri/src/project.rs
    - src/state-manager.js
    - src/components/right-panel.js

key-decisions:
  - "Persist state in Rust after mutation rather than relying on JS to save"
  - "Use getElementById with setTimeout(0) for Arrow.js post-render DOM discovery"

patterns-established:
  - "Rust mutation commands own persistence: mutate + save_state_sync in one command"
  - "JS project helpers reload state from Rust after invoke (never save stale copy)"
  - "Arrow.js components use id attributes + setTimeout for imperative DOM access"

requirements-completed: [PANEL-07, PANEL-01]

duration: 2min
completed: 2026-04-08
---

# Phase 06 Plan 04: UAT Gap Closure Summary

**Fix Add Project persistence (Rust save_state_sync after mutation) and Bash terminal Arrow.js ref bug (getElementById post-render)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-08T06:46:14Z
- **Completed:** 2026-04-08T06:48:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Rust project commands (add, remove, switch) now persist to disk immediately after mutation
- JS state-manager reloads state from Rust after project mutations, eliminating stale overwrite bug
- Bash terminal container discovered via getElementById instead of broken Arrow.js ref callback

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix project mutation persistence and stale state bug** - `f5b6d9e` (fix)
2. **Task 2: Fix Bash terminal container discovery (Arrow.js ref bug)** - `ade65d4` (fix)

## Files Created/Modified
- `src-tauri/src/project.rs` - Added save_state_sync calls after each mutation (add, remove, switch)
- `src/state-manager.js` - Replaced stale save_state calls with load_state reload in project helpers
- `src/components/right-panel.js` - Replaced broken ref callback with id + setTimeout getElementById pattern

## Decisions Made
- Persist state in Rust commands rather than relying on JS-side save -- eliminates race condition where JS stale copy overwrites Rust mutation
- Use setTimeout(0) + getElementById for Arrow.js DOM discovery -- simplest reliable pattern since Arrow.js does not support ref callbacks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Add Project flow should now persist correctly and appear in sidebar
- Bash terminal should connect and render xterm.js in the right-bottom panel
- Remaining UAT tests (checkbox write-back) are independent of these fixes

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit f5b6d9e: FOUND
- Commit ade65d4: FOUND

---
*Phase: 06-right-panel-views*
*Completed: 2026-04-08*
