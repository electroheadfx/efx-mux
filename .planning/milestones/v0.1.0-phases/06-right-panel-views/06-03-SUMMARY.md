---
phase: 06-right-panel-views
plan: 03
subsystem: ui
tags: [tauri-invoke, file-watcher, file-viewer, arrow-js, reactive, custom-events]

# Dependency graph
requires:
  - phase: 06-right-panel-views (plan 01)
    provides: file_watcher.rs with set_project_path command, file_ops.rs with read_file_content
  - phase: 06-right-panel-views (plan 02)
    provides: right panel with gsd-viewer.js listening for md-file-changed events
provides:
  - set_project_path invocation on app init and project switch (activates md file watcher)
  - file-opened event handler that reads file content via Rust backend
  - file viewer overlay in main panel for read-only file display
affects: [07-server-pane, future-tab-system]

# Tech tracking
tech-stack:
  added: []
  patterns: [custom-event-bridge for cross-component communication, overlay-pattern for modal file display]

key-files:
  created: []
  modified: [src/main.js, src/components/main-panel.js]

key-decisions:
  - "Overlay pattern instead of tab system for file viewer -- no tab infrastructure exists yet, overlay achieves same UX"
  - "escapeHtml for XSS protection on file content rendered in pre block"

patterns-established:
  - "Custom event chain: component dispatches -> main.js handles -> dispatches to target component"
  - "Overlay pattern: absolutely positioned div over terminal, Escape/Close to dismiss"

requirements-completed: [PANEL-03, PANEL-06]

# Metrics
duration: 2min
completed: 2026-04-07
---

# Phase 6 Plan 03: MD Watcher + File-Opened Wiring Summary

**Wired set_project_path invocations to activate md file watcher, plus file viewer overlay for read-only file display from File Tree clicks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-07T17:45:20Z
- **Completed:** 2026-04-07T17:46:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- set_project_path is now called on app startup (if active project exists) and on every project switch, activating the Rust md file watcher so gsd-viewer.js auto-refreshes
- file-opened CustomEvents from file-tree.js are now handled -- file content is read via read_file_content Rust command and displayed in a read-only overlay
- File viewer overlay includes READ-ONLY badge, filename header, preformatted content, Close button, and Escape key support
- XSS protection via escapeHtml on all file content before DOM rendering

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire set_project_path on app init and project switch** - `7df6c5f` (feat)
2. **Task 2: Wire file-opened handler and add file viewer overlay** - `1acc339` (feat)

## Files Created/Modified
- `src/main.js` - Added invoke import, set_project_path calls in initProjects() and project-changed handler, file-opened event listener
- `src/components/main-panel.js` - Added reactive file viewer overlay with escapeHtml, show/hide state, Escape key handler

## Decisions Made
- Used overlay pattern (absolutely positioned div) instead of a tab system since no tab infrastructure exists in main-panel.js yet. Terminal stays mounted underneath.
- Used escapeHtml() to sanitize file content before rendering in pre block (T-06-03 threat mitigation).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PANEL-03 (auto-refresh GSD Viewer) and PANEL-06 (file opens from File Tree) gaps are now closed
- File viewer could be enhanced with syntax highlighting in a future phase
- Tab system could replace overlay pattern when multiple file views are needed

---
*Phase: 06-right-panel-views*
*Completed: 2026-04-07*
