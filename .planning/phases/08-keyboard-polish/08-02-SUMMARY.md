---
phase: 08-keyboard-polish
plan: 02
subsystem: ui
tags: [xterm.js, tmux, terminal-tabs, crash-overlay, pty-exit, preact, signals]

# Dependency graph
requires:
  - phase: 08-01
    provides: Consolidated keyboard handler with placeholder tab shortcut calls
  - phase: 02
    provides: PTY bridge, terminal manager, resize handler
  - phase: 04
    provides: State persistence via state-manager.ts
provides:
  - Multi-tab terminal management (createNewTab, closeActiveTab, cycleToNextTab)
  - Terminal tab bar component (TerminalTabBar) in main panel
  - PTY exit event emission with real exit codes from Rust
  - Crash/exit overlay component (CrashOverlay) with restart capability
  - Tab state persistence to state.json
affects: [08-03, 08-04, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tab container visibility via display:none/block (preserves xterm.js scrollback + WebGL)"
    - "tmux remain-on-exit + display-message #{pane_dead_status} for real exit codes"
    - "tauri::Emitter trait import required for app.emit() in Tauri 2"

key-files:
  created:
    - src/components/terminal-tabs.tsx
    - src/components/crash-overlay.tsx
  modified:
    - src/components/main-panel.tsx
    - src/main.tsx
    - src-tauri/src/terminal/pty.rs

key-decisions:
  - "Use tauri::Emitter trait for app.emit() -- Tauri 2 moved emit to the Emitter trait"
  - "Tab containers use display:none/block toggle to preserve scrollback and WebGL context"
  - "PTY exit detection uses tmux remain-on-exit + pane_dead_status query for real exit codes"
  - "Project switch clears all tabs and creates fresh first tab (no session reuse)"

patterns-established:
  - "Pattern: terminal-tabs.tsx as central tab state manager with exported functions for keyboard shortcuts"
  - "Pattern: CrashOverlay renders per-tab inline overlay with restart capability"
  - "Pattern: Rust PTY read loop emits pty-exited event after EOF with real exit code"

requirements-completed: [UX-02, UX-03]

# Metrics
duration: 7min
completed: 2026-04-09
---

# Phase 08 Plan 02: Terminal Tabs + PTY Crash Recovery Summary

**Multi-tab terminal management with per-tab tmux sessions, Ctrl+T/W/Tab shortcuts, PTY exit detection via tmux remain-on-exit, and inline crash overlay with restart**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-09T17:15:31Z
- **Completed:** 2026-04-09T17:22:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Terminal tab bar in main panel with create/close/cycle functionality and keyboard shortcuts
- Each tab backed by its own tmux session with independent PTY connection
- Rust pty.rs emits pty-exited event with real exit codes via tmux remain-on-exit + pane_dead_status
- Crash overlay distinguishes normal exit (green dot, "Session ended") from crash (red dot, "Process crashed" + exit code)
- Tab state persists to state.json; project switch clears tabs and creates fresh first tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Terminal tab management + tab bar + main panel integration** - `ffa8bd8` (feat)
2. **Task 2: PTY exit event emission + crash overlay** - `f867c0f` (feat)

## Files Created/Modified
- `src/components/terminal-tabs.tsx` - Tab state signals, createNewTab/closeActiveTab/cycleToNextTab, TerminalTabBar component, initFirstTab, tab persistence, PTY exit listener, restart logic
- `src/components/crash-overlay.tsx` - Inline overlay for PTY exit/crash with status dot, message, exit code, and restart button
- `src/components/main-panel.tsx` - Added TerminalTabBar + terminal-containers wrapper + ActiveTabCrashOverlay
- `src/main.tsx` - Wired keyboard shortcuts, replaced inline terminal init with initFirstTab, updated project-changed handler
- `src-tauri/src/terminal/pty.rs` - Added Emitter import, remain-on-exit, exit code detection via tmux, pty-exited event emission

## Decisions Made
- Used `tauri::Emitter` trait import for `app.emit()` -- Tauri 2 moved emit to the Emitter trait (Rule 3 auto-fix)
- Project switch clears all tabs and creates a fresh first tab rather than trying to reuse/switch existing sessions
- Removed unused `switchTmuxSession` and `rightPtyKey` from main.tsx (dead code after tab management refactor)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added tauri::Emitter import for app.emit()**
- **Found during:** Task 2 (PTY exit event emission)
- **Issue:** Tauri 2 requires `use tauri::Emitter;` trait import for `app.emit()` -- cargo check failed
- **Fix:** Added `use tauri::{Emitter, Manager};` import in pty.rs
- **Files modified:** src-tauri/src/terminal/pty.rs
- **Verification:** `cargo check` passes
- **Committed in:** f867c0f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for Rust compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tab management and crash overlay complete, ready for first-run wizard (Plan 03) and further polish (Plan 04)
- Keyboard shortcuts fully wired: Ctrl+T/W/Tab functional in consolidated handler

---
*Phase: 08-keyboard-polish*
*Completed: 2026-04-09*
