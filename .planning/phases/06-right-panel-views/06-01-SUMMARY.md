---
phase: 06-right-panel-views
plan: "01"
subsystem: backend
tags: [pty, git2, file-ops, notify, arrow-js, tab-bar]

requires:
  - phase: 05-project-system-sidebar
    provides: "ManagedAppState with ProjectState, project commands"
  - phase: 02-terminal-integration
    provides: "PtyState, spawn_terminal, write_pty, resize_pty, ack_bytes"
provides:
  - "PtyManager(HashMap<String, PtyState>) for multi-session PTY support"
  - "File operations: get_file_diff, list_directory, read_file_content, write_checkbox"
  - ".md file watcher emitting md-file-changed events"
  - "TabBar reusable Arrow.js component"
affects: [06-02-PLAN, right-panel-views, gsd-viewer, diff-viewer, file-tree]

tech-stack:
  added: [regex]
  patterns: [PtyManager HashMap wrapper, file watcher thread pattern, tab-bar component]

key-files:
  created:
    - "src-tauri/src/file_ops.rs"
    - "src-tauri/src/file_watcher.rs"
    - "src/components/tab-bar.js"
  modified:
    - "src-tauri/src/terminal/pty.rs"
    - "src-tauri/src/lib.rs"
    - "src-tauri/Cargo.toml"
    - "src/styles/layout.css"

key-decisions:
  - "Used regex crate for checkbox line validation instead of manual string parsing"
  - "file_watcher watches all .md files in project dir (not just PLAN.md) for broader GSD support"
  - "PtyManager initialized once in setup(), not per-spawn, for correct Tauri state lifecycle"

patterns-established:
  - "PtyManager pattern: HashMap<String, PtyState> keyed by session name for multi-PTY"
  - "File ops pattern: spawn_blocking for all filesystem/git2 operations"
  - "TabBar pattern: TabBar(tabs, activeTab, onSwitch) for reusable tab UI"

requirements-completed: [PANEL-01, PANEL-02, PANEL-03, PANEL-04, PANEL-05, PANEL-06, PANEL-07]

duration: 5min
completed: 2026-04-07
---

# Phase 06 Plan 01: Backend Infrastructure + Tab Bar Summary

**Multi-session PtyManager, file operations (diff/list/read/checkbox), .md file watcher, and reusable TabBar component for right panel views**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-07T15:04:28Z
- **Completed:** 2026-04-07T15:09:06Z
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments
- Refactored PtyState to PtyManager HashMap for multi-session PTY support (D-09)
- Created file_ops.rs with git2 diff, directory listing, file reading, and checkbox write-back
- Created file_watcher.rs with debounced .md file change events for GSD Viewer auto-refresh
- Created reusable TabBar Arrow.js component with CSS styles as Wave 2 foundation
- All Phase 6 commands registered in lib.rs invoke_handler

## Task Commits

Each task was committed atomically:

1. **Task 0: Tab bar component (D-11, PANEL-01)** - `0c1c042` (feat)
2. **Task 1: PtyManager HashMap refactor (D-09)** - `908cda3` (feat)
3. **Task 2: New Rust commands (file_ops.rs)** - `5f90755` (feat)
4. **Task 3: .md file watcher (D-02)** - `8714827` (feat)
5. **Task 4: lib.rs updates** - `caadb7a` (feat)

## Files Created/Modified
- `src/components/tab-bar.js` - Reusable TabBar(tabs, activeTab, onSwitch) component
- `src/styles/layout.css` - Tab bar CSS styles (.tab-bar, .tab-btn, .active)
- `src-tauri/src/terminal/pty.rs` - PtyManager HashMap wrapper, session-aware commands
- `src-tauri/src/file_ops.rs` - get_file_diff, list_directory, read_file_content, write_checkbox, read_file
- `src-tauri/src/file_watcher.rs` - start_md_watcher, set_project_path with notify debouncer
- `src-tauri/src/lib.rs` - Module declarations, command registration, PtyManager init
- `src-tauri/Cargo.toml` - Added regex dependency

## Decisions Made
- Used regex crate for checkbox line validation -- more robust than manual string matching for `[ ]`/`[x]` patterns
- file_watcher watches all .md files in project directory (not just PLAN.md) for broader GSD file support
- PtyManager initialized once in setup() via app.manage() -- correct Tauri state lifecycle instead of per-spawn manage()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added regex crate dependency**
- **Found during:** Task 2 (file_ops.rs)
- **Issue:** write_checkbox needs regex for checkbox line validation, but regex was not in Cargo.toml
- **Fix:** Added `regex = "1"` to Cargo.toml dependencies
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** cargo check passes
- **Committed in:** 5f90755 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential dependency for checkbox validation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend infrastructure ready for Wave 2 (06-02-PLAN)
- TabBar component available for GSD Viewer, Diff Viewer, File Tree views
- PtyManager ready for right-panel terminal sessions
- File watcher ready for GSD Viewer auto-refresh

---
## Self-Check: PASSED

All 6 created/modified files verified present. All 5 task commits verified in git log.

---
*Phase: 06-right-panel-views*
*Completed: 2026-04-07*
