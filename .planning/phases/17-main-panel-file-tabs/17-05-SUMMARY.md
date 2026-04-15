---
phase: 17-main-panel-file-tabs
plan: 05
subsystem: ui
tags: [tauri-events, git-refresh, codemirror, terminal-persistence, xterm]

# Dependency graph
requires:
  - phase: 17-01
    provides: file-service.ts writeFile, editor-tab.tsx EditorTab component
  - phase: 17-02
    provides: terminal-tabs.tsx tab management with tmux persistence
provides:
  - Git status refresh after file save via emit('git-status-changed')
  - Editor content refresh after git checkout/revert
  - Tab type persistence (isAgent field) for correct agent/shell restore
affects: [terminal-tabs, editor-tab, file-service, sidebar, git-changes-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tauri emit() for frontend-to-frontend event bridging (same event name as backend)"
    - "isAgent field on TerminalTab for persisted tab identity across restarts"

key-files:
  created: []
  modified:
    - src/services/file-service.ts
    - src/components/editor-tab.tsx
    - src/components/terminal-tabs.tsx

key-decisions:
  - "Use Tauri emit() with same git-status-changed event name rather than new DOM event -- existing sidebar and git-changes-tab listeners pick it up without modification"
  - "Add isAgent boolean to TerminalTab with backward-compatible fallback (old data without isAgent falls back to index heuristic)"
  - "restartTabSession conditionally resolves agent binary based on tab.isAgent to preserve identity on crash recovery"

patterns-established:
  - "Frontend emit('git-status-changed') after writeFile: bridges working-tree changes to existing Tauri event listeners"
  - "Tab type persistence: isAgent field persisted to state.json, used in restore/restart paths"

requirements-completed: [EDIT-01, EDIT-02, EDIT-03, EDIT-04, MAIN-01]

# Metrics
duration: 3min
completed: 2026-04-15
---

# Phase 17 Plan 05: UAT Gap Closure Summary

**Git tree refresh after file save via Tauri emit, editor content reload after git revert, and terminal tab type persistence (isAgent) for correct agent/shell restore**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-15T16:46:51Z
- **Completed:** 2026-04-15T16:49:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Saving a file via Cmd+S now triggers sidebar git tree refresh by emitting git-status-changed from writeFile
- Editor tabs refresh content after git checkout/revert by listening for git-status-changed and re-reading from disk
- Terminal tab type (agent vs shell) persisted to state.json -- Zsh tabs restore as Zsh, Agent tabs restore as Agent
- Backward compatibility: old persisted state without isAgent falls back to index-based heuristic

## Task Commits

Each task was committed atomically:

1. **Task 1: Git tree refresh after save and editor content refresh after revert** - `711ffc1` (fix)
2. **Task 2: Fix terminal session stability and tab type persistence** - `5cec25a` (fix)

## Files Created/Modified
- `src/services/file-service.ts` - Added emit('git-status-changed') after writeFile succeeds, imported emit from @tauri-apps/api/event
- `src/components/editor-tab.tsx` - Added useEffect listening for git-status-changed to re-read file and update editor if disk content changed; imported listen and readFile
- `src/components/terminal-tabs.tsx` - Added isAgent field to TerminalTab interface and all creation/persistence/restore paths; fixed restoreTabs to use saved.isAgent; fixed restartTabSession to conditionally resolve agent binary

## Decisions Made
- Used Tauri emit() with the same `git-status-changed` event name (not a new event) so existing sidebar and git-changes-tab listeners automatically pick up save-triggered refreshes without any changes to those components
- Added `isAgent` as a boolean to TerminalTab with `?? false` fallback in serialization and `?? (i === 0 && !!agentBinary)` backward-compatible fallback in restoreTabs for old persisted data
- Made restartTabSession conditionally resolve agent binary based on `tab.isAgent` rather than always resolving it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UAT Gaps 2 and 4 are now closed
- All file editing and terminal persistence flows work end-to-end
- Ready for remaining gap closure plans (if any) or phase transition

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits verified in git log (711ffc1, 5cec25a)
- TypeScript compilation passes with zero errors
- No stubs or placeholder patterns detected

---
*Phase: 17-main-panel-file-tabs*
*Completed: 2026-04-15*
