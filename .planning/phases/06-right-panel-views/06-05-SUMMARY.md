---
phase: 06-right-panel-views
plan: 05
subsystem: ui
tags: [arrow-js, git2, xterm, resize-observer, tauri-commands]

requires:
  - phase: 06-right-panel-views/04
    provides: "Right panel tab views, bash terminal, getElementById pattern"
provides:
  - "GSD Viewer loads markdown via getElementById (not stuck on Loading GSD)"
  - "Sidebar GIT CHANGES lists individual files from get_git_files"
  - "File tree root boundary guard (JS + Rust canonicalize)"
  - "Bash terminal resize handler via ResizeObserver"
affects: []

tech-stack:
  added: []
  patterns: ["Arrow.js getElementById pattern for DOM discovery (replaces broken ref callbacks)", "Rust canonical path validation for directory containment"]

key-files:
  created: []
  modified:
    - src/components/gsd-viewer.js
    - src/components/sidebar.js
    - src-tauri/src/git_status.rs
    - src-tauri/src/lib.rs
    - src/components/file-tree.js
    - src-tauri/src/file_ops.rs
    - src/components/right-panel.js

key-decisions:
  - "Arrow.js ref callbacks are broken -- always use getElementById with setTimeout(0)"
  - "Sidebar git reactivity requires full object reassignment, not in-place mutation"
  - "list_directory accepts optional project_root for server-side canonicalize containment check"

patterns-established:
  - "Arrow.js DOM discovery: setTimeout + getElementById, never ref callbacks"
  - "Reactive object updates: full reassignment (state.x = {...state.x, key: val}) not mutation"

requirements-completed: [PANEL-02, PANEL-04, PANEL-05, PANEL-06]

duration: 3min
completed: 2026-04-08
---

# Phase 06 Plan 05: UAT Gap Closure Summary

**Fix GSD Viewer loading, sidebar git file listing, file tree root guard, and bash terminal resize -- closing 4 remaining UAT gaps**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-08T08:10:46Z
- **Completed:** 2026-04-08T08:13:38Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- GSD Viewer renders markdown on first load via getElementById pattern (was stuck on "Loading GSD..." due to broken Arrow.js ref callback)
- Sidebar GIT CHANGES section lists individual changed files from new get_git_files Rust command with reactive state updates
- File tree navigation cannot escape project root (JS guard + Rust canonical path validation)
- Bash terminal resizes responsively via ResizeObserver when right panel is resized

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix GSD Viewer loading + sidebar git reactivity + file listing** - `b20fd63` (feat)
2. **Task 2: File tree root boundary guard + bash terminal resize handler** - `2f872d2` (feat)

## Files Created/Modified
- `src/components/gsd-viewer.js` - Replaced broken ref callback with getElementById pattern for DOM discovery
- `src/components/sidebar.js` - Added gitFiles state, fixed reactive mutation, wired get_git_files invoke
- `src-tauri/src/git_status.rs` - Added GitFileEntry struct and get_git_files command
- `src-tauri/src/lib.rs` - Registered get_git_files in invoke_handler
- `src/components/file-tree.js` - Added root boundary guard on Backspace, pass projectRoot to list_directory, fixed ref callback
- `src-tauri/src/file_ops.rs` - Added optional project_root param with canonical path containment check
- `src/components/right-panel.js` - Imported and attached resize handler for bash terminal

## Decisions Made
- Arrow.js ref callbacks serialize as string attributes in WKWebView -- always use getElementById with setTimeout(0) for DOM discovery
- Sidebar git data must use full object reassignment to trigger Arrow.js reactive proxy
- list_directory accepts optional project_root and uses std::fs::canonicalize for symlink-safe containment check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed file-tree.js ref callback (same Arrow.js bug)**
- **Found during:** Task 2
- **Issue:** file-tree.js also used ref callback pattern that doesn't work in Arrow.js
- **Fix:** Replaced with setTimeout + loadDir pattern (same as gsd-viewer fix)
- **Files modified:** src/components/file-tree.js
- **Verification:** cargo build passes
- **Committed in:** 2f872d2 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed sidebar refresh button in-place mutation**
- **Found during:** Task 1
- **Issue:** Refresh button handler also used in-place gitData mutation (same reactivity bug)
- **Fix:** Replaced inline handler with call to refreshAllGitStatus() which does full reassignment
- **Files modified:** src/components/sidebar.js
- **Verification:** Code review confirms consistent pattern
- **Committed in:** b20fd63 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. Same root causes as planned fixes, just in additional locations.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 UAT gaps closed, Phase 06 should now pass verification
- No blockers for Phase 06 sign-off

---
## Self-Check: PASSED

All 7 modified files verified present. Both commits (b20fd63, 2f872d2) confirmed in log. Key patterns verified: getElementById in gsd-viewer.js, get_git_files in git_status.rs, state.gitData assignment in sidebar.js, attachResizeHandler in right-panel.js, project_root validation in file_ops.rs.

---
*Phase: 06-right-panel-views*
*Completed: 2026-04-08*
