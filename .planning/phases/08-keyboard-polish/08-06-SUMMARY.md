---
phase: 08-keyboard-polish
plan: 06
subsystem: terminal
tags: [tabs, tmux, session-persistence, pty, xterm, reflow]

# Dependency graph
requires:
  - phase: 08-05
    provides: cleanup_dead_sessions Tauri command for startup cleanup
  - phase: 08-07
    provides: Keyboard guard allowing Ctrl+Cmd, AppState.projects field, sidebar race fix
provides:
  - Ctrl+T always creates plain shell tabs (never agent)
  - Tab switching defers fit+focus via requestAnimationFrame for proper reflow
  - Tab restoration from state.json on app restart via restoreTabs()
  - Dead tmux session cleanup on startup
affects: [09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "requestAnimationFrame for terminal fit+focus after display:block switch"
    - "restoreTabs reads persisted tab data, reconnects PTY per saved session name"
    - "First restored tab gets agent binary, subsequent tabs are plain shell"

key-files:
  created: []
  modified:
    - src/components/terminal-tabs.tsx
    - src/main.tsx

key-decisions:
  - "createNewTab() hardcodes agentBinary=undefined -- only initFirstTab and restoreTabs(index=0) pass agent binary"
  - "restoreTabs generates new tab IDs (old IDs are ephemeral) and defaults active to first tab"
  - "cleanup_dead_sessions called before tab restore to avoid reconnecting dead tmux sessions"

patterns-established:
  - "Pattern: requestAnimationFrame between display:block and terminal fit/focus operations"
  - "Pattern: JSON.parse of persisted state wrapped in try/catch with fallback to fresh init"

requirements-completed: [UX-02]

# Metrics
duration: 2min
completed: 2026-04-10
---

# Phase 08 Plan 06: Tab Creation, Switching, and Persistence Summary

**Ctrl+T spawns plain shell tabs, tab switching defers fit+focus for proper reflow, and tabs restore from state.json on restart with dead session cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-10T08:02:58Z
- **Completed:** 2026-04-10T08:04:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- createNewTab() no longer calls resolveAgentBinary -- Ctrl+T tabs are always plain shell (UAT gap 1)
- switchToTab() defers fitAddon.fit() and terminal.focus() via requestAnimationFrame so browser completes reflow before measuring dimensions (UAT gap 3)
- New restoreTabs() function restores tabs from persisted state.json data, reconnecting PTY per saved session name
- Bootstrap calls cleanup_dead_sessions before tab restore to clean stale tmux sessions (from Plan 05)
- Tab restore wrapped in try/catch with fallback to initFirstTab (threat T-08-06-01 mitigated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix createNewTab agent resolution + switchToTab reflow timing** - `31747d5` (fix)
2. **Task 2: Add tab restore logic on app startup** - `a52e674` (feat)

## Files Created/Modified
- `src/components/terminal-tabs.tsx` - createNewTab hardcodes agentBinary=undefined, switchToTab uses requestAnimationFrame, new restoreTabs() export
- `src/main.tsx` - Import restoreTabs, call cleanup_dead_sessions before terminal init, attempt tab restore from state.json before initFirstTab

## Decisions Made
- createNewTab always sets agentBinary=undefined rather than checking a flag -- simpler and matches the invariant that only first-tab and restore paths need agents
- restoreTabs generates fresh tab IDs since persisted IDs are ephemeral (timestamp-based) -- activates first tab by default
- cleanup_dead_sessions placed before tab restore (not after) so stale tmux sessions are gone before connectPty attempts to reattach

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three tab management UAT failures (tests 3, 5, 6) addressed
- Ctrl+T creates plain shell, Ctrl+Tab switches smoothly, tabs persist across restart
- Dead session cleanup prevents zombie tmux sessions from accumulating
- Ready for Phase 09 (Rich Dashboard Views)

## Self-Check: PASSED

All files exist, all commits found, all key code patterns verified:
- terminal-tabs.tsx: agentBinary = undefined (line 129), requestAnimationFrame in switchToTab (line 330), restoreTabs export (line 435)
- main.tsx: cleanup_dead_sessions invoke (line 211), restoreTabs import and call (lines 23, 230)

---
*Phase: 08-keyboard-polish*
*Completed: 2026-04-10*
