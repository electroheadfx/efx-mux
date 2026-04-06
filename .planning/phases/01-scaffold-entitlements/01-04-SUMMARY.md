---
phase: 01-scaffold-entitlements
plan: 04
subsystem: ui
tags: [tauri, macos, menu, entitlements, clipboard, csp]

# Dependency graph
requires:
  - phase: 01-scaffold-entitlements/01-03
    provides: "3-zone layout with drag handles and sidebar toggle"
provides:
  - "macOS Edit menu with Cmd+C/V/X/A clipboard support via PredefinedMenuItem"
  - "Entitlements.plist with sandbox=false + network/files access keys"
  - "Finalized tauri.conf.json with CSP, window size, bundle entitlements"
affects: [02-pty-terminal]

# Tech tracking
tech-stack:
  added: []
  patterns: [tauri-menu-builder, predefined-menu-items, macos-entitlements]

key-files:
  created: [src-tauri/Entitlements.plist]
  modified: [src-tauri/src/lib.rs, src-tauri/tauri.conf.json]

key-decisions:
  - "PredefinedMenuItem::about takes 3 args in Tauri 2.10.3 (manager, text, metadata)"
  - "PredefinedMenuItem::close_window (not close) for window close menu item"
  - "Bundle targets kept as 'all' rather than specific array (Tauri 2 BundleTargetInner constraint)"

patterns-established:
  - "Menu setup in Builder::setup closure using SubmenuBuilder + PredefinedMenuItem"
  - "Entitlements.plist at src-tauri/ root, referenced via ./Entitlements.plist in tauri.conf.json"

requirements-completed: [LAYOUT-04]

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 1 Plan 4: macOS Menu + Entitlements + Config Finalization Summary

**macOS Edit menu with PredefinedMenuItem clipboard (copy/paste/cut/undo/redo/select_all), Entitlements.plist with sandbox=false, and finalized tauri.conf.json with CSP + 1400x900 window**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T13:09:57Z
- **Completed:** 2026-04-06T13:12:08Z
- **Tasks:** 1 of 1 auto tasks (Task 2 is UAT checkpoint)
- **Files modified:** 3

## Accomplishments
- macOS Edit menu wires Cmd+C/V/X/A to WKWebView clipboard via PredefinedMenuItem
- Entitlements.plist locks sandbox=false + network.client + files access for future phases
- tauri.conf.json finalized with CSP (unsafe-inline for importmap), 1400x900 window, bundle entitlements reference

## Task Commits

Each task was committed atomically:

1. **Task 1: Write lib.rs clipboard menu + entitlements + tauri.conf.json** - `8b77f47` (feat)

## Files Created/Modified
- `src-tauri/src/lib.rs` - Full menu setup with App/Edit/Window submenus using PredefinedMenuItem
- `src-tauri/Entitlements.plist` - macOS entitlements: sandbox=false, network.client, files.user-selected.read-write, files.downloads.read-write
- `src-tauri/tauri.conf.json` - Finalized: CSP with unsafe-inline, 1400x900 window, bundle.macOS.entitlements reference

## Decisions Made
- PredefinedMenuItem::about requires 3 arguments in Tauri 2.10.3 (not 2 as in plan interfaces) -- adapted to actual API
- PredefinedMenuItem::close_window is the correct method name (not close) -- adapted to actual API
- Bundle targets kept as "all" string (not ["dmg", "macos"] array) because Tauri 2 BundleTargetInner enum doesn't accept "macos" as a variant

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PredefinedMenuItem::about() argument count**
- **Found during:** Task 1 (cargo build)
- **Issue:** Plan specified `about(app, None)` but Tauri 2.10.3 requires 3 args: `about(manager, text, metadata)`
- **Fix:** Changed to `PredefinedMenuItem::about(app, None, None)`
- **Files modified:** src-tauri/src/lib.rs
- **Verification:** cargo build passes
- **Committed in:** 8b77f47

**2. [Rule 1 - Bug] Fixed PredefinedMenuItem::close -> close_window**
- **Found during:** Task 1 (cargo build)
- **Issue:** Plan specified `PredefinedMenuItem::close()` but method is named `close_window()` in Tauri 2.10.3
- **Fix:** Changed to `PredefinedMenuItem::close_window(app, None)`
- **Files modified:** src-tauri/src/lib.rs
- **Verification:** cargo build passes
- **Committed in:** 8b77f47

**3. [Rule 1 - Bug] Fixed bundle targets format**
- **Found during:** Task 1 (cargo build)
- **Issue:** Plan specified `"targets": ["dmg", "macos"]` but "macos" is not a valid BundleTargetInner variant
- **Fix:** Changed to `"targets": "all"` (original scaffold value, works correctly)
- **Files modified:** src-tauri/tauri.conf.json
- **Verification:** cargo build passes
- **Committed in:** 8b77f47

---

**Total deviations:** 3 auto-fixed (3 bugs from plan API mismatch with Tauri 2.10.3)
**Impact on plan:** All fixes required for compilation. No scope creep.

## Issues Encountered
None beyond the API mismatches documented as deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 scaffold complete pending UAT verification
- All entitlements locked for Phase 2 PTY spawning
- CSP configured for importmap-based Arrow.js loading

---
*Phase: 01-scaffold-entitlements*
*Completed: 2026-04-06*
