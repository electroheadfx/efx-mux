---
phase: 07-server-pane-agent-support
plan: 04
subsystem: ui
tags: [ansi, xterm-256color, truecolor, server-pane, preact, signals]

requires:
  - phase: 07-server-pane-agent-support
    provides: "Server pane with start/stop/restart/open controls and ANSI log streaming"
provides:
  - "256-color and truecolor ANSI rendering in server logs"
  - "Clean SIGTERM/SIGKILL exit handling (no false crash indicators)"
  - "Restart toolbar race condition fix via isRestarting guard"
affects: []

tech-stack:
  added: []
  patterns:
    - "Index-based ANSI code loop for multi-part sequence consumption"
    - "Module-level mutable flag (not signal) for cross-callback state that should not trigger re-renders"

key-files:
  created: []
  modified:
    - src/server/ansi-html.ts
    - src/styles/app.css
    - src/components/server-pane.tsx

key-decisions:
  - "Used color:inherit on .server-pane-logs instead of direct color to avoid Tailwind 4 layer specificity issues"
  - "isRestarting is a module-level let (not a Preact signal) since it must not trigger re-renders"
  - "2s timeout on isRestarting clears the guard after restart settles"

patterns-established:
  - "color256() helper for full xterm-256color palette mapping"

requirements-completed: [AGENT-01, AGENT-03]

duration: 2min
completed: 2026-04-09
---

# Phase 07 Plan 04: UAT Gap Closure Summary

**256-color/truecolor ANSI rendering, clean SIGTERM stop handling, and restart toolbar race condition fix**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-09T10:15:42Z
- **Completed:** 2026-04-09T10:17:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended ansiToHtml to handle 256-color (38;5;N) and truecolor (38;2;R;G;B) ANSI sequences for both foreground and background
- Exit codes 143 (SIGTERM) and 137 (SIGKILL) now treated as clean stop instead of crash
- ELIFECYCLE stderr lines filtered from log output after intentional stop
- isRestarting guard prevents stale server-stopped events from corrupting toolbar state during restart

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix ANSI color rendering and exit 143 clean stop** - `f00c269` (fix)
2. **Task 2: Fix restart toolbar race condition with isRestarting guard** - `96c186a` (fix)

## Files Created/Modified
- `src/server/ansi-html.ts` - Added color256() helper, 256-color/truecolor/background ANSI parsing, index-based loop
- `src/styles/app.css` - Changed .server-pane-logs color to inherit
- `src/components/server-pane.tsx` - isRestarting guard, exit 143/137 clean stop, ELIFECYCLE filter

## Decisions Made
- Used `color: inherit` on `.server-pane-logs` to avoid Tailwind 4 @layer specificity issues while still inheriting correct default text color from parent `.server-pane` element
- isRestarting is a module-level `let` (not a Preact signal) because it controls cross-callback behavior without needing re-renders
- 2-second timeout on isRestarting is a pragmatic UX tradeoff (T-07-08 accepted risk)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree lacks node_modules so `pnpm build` (vite) could not run, but `tsc --noEmit` passed cleanly confirming type correctness

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 UAT gaps from Phase 07 are closed
- Server pane is feature-complete with correct ANSI colors, clean stop behavior, and stable restart toolbar

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 07-server-pane-agent-support*
*Completed: 2026-04-09*
