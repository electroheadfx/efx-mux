---
phase: 08-keyboard-polish
plan: 05
subsystem: terminal
tags: [pty, tmux, exit-detection, crash-recovery, pane-dead, monitoring-thread]

# Dependency graph
requires:
  - phase: 08-02
    provides: PTY exit event pattern (remain-on-exit + pane_dead_status) and crash overlay
  - phase: 02
    provides: PTY bridge, terminal manager, read loop architecture
provides:
  - Reliable PTY exit detection via parallel pane-death monitoring thread
  - cleanup_dead_sessions Tauri command for app startup dead session cleanup
  - Shared AtomicBool stop flag for clean read loop shutdown on pane death
affects: [08-06, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Parallel monitoring thread polls tmux pane_dead every 500ms instead of relying on post-EOF detection"
    - "Arc<AtomicBool> shared stop flag between monitoring and read loop threads"
    - "cleanup_dead_sessions scans all tmux sessions for pane_dead=1 on app startup"

key-files:
  created: []
  modified:
    - src-tauri/src/terminal/pty.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "Replaced unreachable post-EOF exit detection with parallel monitoring thread -- remain-on-exit prevents EOF"
  - "500ms polling interval balances responsiveness vs CPU cost for pane death detection"
  - "cleanup_dead_sessions returns list of cleaned session names for frontend logging"

patterns-established:
  - "Pattern: Parallel monitoring thread for tmux pane state changes (not inline in read loop)"
  - "Pattern: AtomicBool stop flag for cross-thread PTY lifecycle coordination"

requirements-completed: [UX-03]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 08 Plan 05: PTY Exit Detection via Pane-Death Monitoring Summary

**Replaced unreachable post-EOF exit detection with parallel tmux pane-death monitoring thread that polls pane_dead status every 500ms and emits pty-exited with real exit codes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-10T07:54:34Z
- **Completed:** 2026-04-10T07:56:36Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed unreachable exit detection code (lines 183-229) that never fired because remain-on-exit keeps PTY master alive
- Added parallel monitoring thread that polls tmux pane_dead status every 500ms to detect shell exit
- Added shared Arc<AtomicBool> stop flag so monitoring thread can signal read loop to break out
- Added cleanup_dead_sessions Tauri command that scans all tmux sessions for pane_dead=1 and kills them
- Registered cleanup_dead_sessions in lib.rs invoke_handler for frontend access

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace remain-on-exit EOF strategy with pane-death monitoring thread** - `ffc7d77` (feat)

## Files Created/Modified
- `src-tauri/src/terminal/pty.rs` - Removed unreachable post-EOF detection, added parallel monitoring thread with 500ms pane_dead polling, added cleanup_dead_sessions command, added AtomicBool import and shared stop flag
- `src-tauri/src/lib.rs` - Added cleanup_dead_sessions to import and invoke_handler registration

## Decisions Made
- Kept remain-on-exit=on (needed to query exit code after death) but moved detection to separate thread
- 500ms polling interval chosen as balance between responsiveness (plan specified <1s detection) and CPU cost
- cleanup_dead_sessions returns Vec<String> of cleaned session names so frontend can log what was cleaned

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PTY exit detection now works reliably via monitoring thread, unblocking crash overlay rendering
- cleanup_dead_sessions ready to be wired from JS on app startup (Plan 06)
- Restart button will create fresh sessions instead of reattaching dead ones

## Self-Check: PASSED

All files exist, all commits found, all key code patterns verified.

---
*Phase: 08-keyboard-polish*
*Completed: 2026-04-10*
