---
phase: 07-server-pane-agent-support
plan: 06
subsystem: server
tags: [process-management, per-project, hashmap, sigterm, sigkill, zombie-prevention]

requires:
  - phase: 07-server-pane-agent-support
    provides: "Server pane with start/stop/restart, EOF-based exit detection (07-05)"
provides:
  - "Per-project server process HashMap in Rust (ServerProcesses)"
  - "Reliable process kill with SIGTERM + SIGKILL fallback + waitpid reaping"
  - "kill_all_servers() for app close handler"
  - "Per-project frontend server state cache (logs, status, URL)"
  - "Project switch preserves server state instead of killing servers"
affects: [server-pane, project-switching, app-lifecycle]

tech-stack:
  added: []
  patterns: ["per-project HashMap keyed by project name", "event payload includes project_id for filtering"]

key-files:
  created: []
  modified:
    - src-tauri/src/server.rs
    - src-tauri/src/lib.rs
    - src/server/server-bridge.ts
    - src/components/server-pane.tsx
    - src/main.tsx

key-decisions:
  - "Servers keep running on project switch instead of being killed"
  - "Per-project state cached in frontend Map, not signals (background state)"
  - "Event payloads include project field for per-project filtering"

patterns-established:
  - "Per-project HashMap pattern: Rust state keyed by project name string"
  - "Event filtering: always update cache, only update signals for active project"

requirements-completed: [AGENT-01, AGENT-03, AGENT-06]

duration: 4min
completed: 2026-04-09
---

# Phase 07 Plan 06: Per-Project Server Process Management Summary

**Per-project server HashMap in Rust with reliable killpg/waitpid, frontend state cache preserving logs/status/URL across project switches**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-09T08:00:28Z
- **Completed:** 2026-04-09T08:04:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced single ServerProcess with per-project ServerProcesses HashMap keyed by project name
- Reliable process kill with SIGTERM, 3-second SIGKILL fallback, and proper waitpid reaping to prevent zombies
- kill_all_servers() iterates and kills all project servers on app close (T-07-10 mitigation)
- Frontend per-project cache preserves logs, status, and detected URL across project switches
- Project switch no longer kills running servers -- just swaps UI state

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor Rust server to per-project HashMap with reliable kill** - `7bf5a11` (feat)
2. **Task 2: Update frontend bridge and server pane for per-project state** - `de98ddf` (feat)

## Files Created/Modified
- `src-tauri/src/server.rs` - Per-project ServerProcesses HashMap, stop_server_for_project, kill_all_servers
- `src-tauri/src/lib.rs` - Updated managed state type, close handler uses kill_all_servers
- `src/server/server-bridge.ts` - All commands accept projectId, event listeners handle JSON payload
- `src/components/server-pane.tsx` - Per-project cache Map, save/restore helpers, event filtering by project
- `src/main.tsx` - Project switch saves/restores server state instead of killing

## Decisions Made
- Servers keep running on project switch instead of being killed -- users can run multiple servers simultaneously
- Per-project state cached in a plain Map (not signal) since it stores background state for non-active projects
- Event payloads changed from plain string/number to JSON objects with project field for filtering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed borrow checker error in kill_all_servers**
- **Found during:** Task 1 (cargo check)
- **Issue:** Rust borrow checker rejected `sp` lifetime in kill_all_servers -- State reference dropped while MutexGuard still borrowed
- **Fix:** Restructured to collect PIDs in a scoped block, release lock, then iterate PIDs outside the lock scope
- **Files modified:** src-tauri/src/server.rs
- **Verification:** cargo check passes
- **Committed in:** 7bf5a11 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor Rust borrow checker fix, no scope change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Per-project server management complete, ready for UAT verification
- Stop button should now reliably free ports
- App close kills all servers across all projects

---
## Self-Check: PASSED

All 5 modified files exist. Both task commits (7bf5a11, de98ddf) verified in git log.

---
*Phase: 07-server-pane-agent-support*
*Completed: 2026-04-09*
