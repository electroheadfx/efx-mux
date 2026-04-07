---
phase: 03-terminal-theming
plan: 03
subsystem: theming
tags: [iterm2, tauri-command, color-conversion, serde-json]

# Dependency graph
requires:
  - phase: 03-terminal-theming (plan 01)
    provides: ThemeConfig struct, theme_path(), ensure_config_dir(), load_theme command
  - phase: 03-terminal-theming (plan 02)
    provides: JS theme-manager with applyTheme and registerTerminal
provides:
  - iTerm2 JSON profile importer (import_iterm2_theme Tauri command)
  - Float RGB to hex color conversion for all 20 iTerm2 color keys
  - theme.json backup before overwrite
affects: [phase-08-settings-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [serde_json Value patching for partial struct updates]

key-files:
  created: [src-tauri/src/theme/iterm2.rs]
  modified: [src-tauri/src/theme/mod.rs, src-tauri/src/lib.rs]

key-decisions:
  - "Derive chrome colors (bg, accent, text_bright, border) from imported terminal colors for consistent theming"

patterns-established:
  - "iTerm2 import pattern: serialize struct to Value, patch keys, deserialize back"

requirements-completed: [THEME-02]

# Metrics
duration: 1min
completed: 2026-04-07
---

# Phase 3 Plan 3: iTerm2 Theme Importer Summary

**iTerm2 JSON profile importer converting 20 float-RGB color keys to hex theme.json with backup and hot-reload integration**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-07T09:06:48Z
- **Completed:** 2026-04-07T09:08:07Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 3

## Accomplishments
- Created iTerm2 importer that converts all 20 color keys (16 ANSI + fg/bg/cursor/selection) from float RGB to hex
- Backs up existing theme.json to theme.json.bak before overwrite (T-03-07 mitigation)
- Derives chrome colors from imported terminal colors for consistent app-wide theming
- Registered import_iterm2_theme as Tauri invoke command

## Task Commits

Each task was committed atomically:

1. **Task 1: Create iTerm2 importer Tauri command** - `424415d` (feat)
2. **Task 2: UAT verify complete theme system** - auto-approved checkpoint (no commit)

## Files Created/Modified
- `src-tauri/src/theme/iterm2.rs` - iTerm2 JSON profile importer with color conversion and backup logic
- `src-tauri/src/theme/mod.rs` - Added `pub mod iterm2` declaration
- `src-tauri/src/lib.rs` - Registered import_iterm2_theme in Tauri invoke handler

## Decisions Made
- Derive chrome colors (bg, accent, text_bright, border) from imported terminal colors so the entire UI updates consistently when importing an iTerm2 theme

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 terminal theming complete: theme loading, hot-reload watcher, JS theme manager, and iTerm2 importer all in place
- Settings UI (Phase 8) can wire the import_iterm2_theme command to a file picker dialog

---
*Phase: 03-terminal-theming*
*Completed: 2026-04-07*

## Self-Check: PASSED

- All created files exist on disk
- Commit 424415d verified in git log
- All acceptance criteria patterns found in source files
- cargo build succeeded with exit code 0
