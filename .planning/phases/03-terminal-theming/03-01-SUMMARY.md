---
phase: 03-terminal-theming
plan: 01
subsystem: theme
tags: [notify, serde, file-watcher, solarized-dark, tauri-events]

# Dependency graph
requires:
  - phase: 02-terminal-integration
    provides: "Tauri setup hook, module structure pattern, PTY streaming architecture"
provides:
  - "ThemeConfig Rust types with Solarized Dark defaults"
  - "load_theme Tauri command for startup theme loading"
  - "File watcher emitting theme-changed Tauri events on theme.json modification"
  - "Auto-creation of ~/.config/efxmux/theme.json on first launch"
affects: [03-02, 03-03, 04-state-persistence]

# Tech tracking
tech-stack:
  added: [notify 8.2, notify-debouncer-mini 0.7]
  patterns: [file-watcher-on-parent-dir, serde-default-merge, debounced-tauri-events]

key-files:
  created:
    - src-tauri/src/theme/mod.rs
    - src-tauri/src/theme/types.rs
    - src-tauri/src/theme/watcher.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs

key-decisions:
  - "Watch parent directory (~/.config/efxmux/) not file, for atomic save compatibility"
  - "Use serde(default) on all fields so partial themes merge over defaults"
  - "Emit serde_json::Value (not ThemeConfig) in theme-changed event for JS flexibility"

patterns-established:
  - "File watcher pattern: OS thread + notify-debouncer-mini + NonRecursive on parent dir"
  - "Config dir pattern: ensure_config_dir() in setup() before any file access"
  - "Theme merge pattern: serde(default) per-field enables partial theme.json overrides"

requirements-completed: [THEME-01, THEME-03]

# Metrics
duration: 3min
completed: 2026-04-07
---

# Phase 3 Plan 1: Rust Theme Backend Summary

**Rust theme module with ThemeConfig types (Solarized Dark defaults), load_theme Tauri command, config dir auto-creation, and debounced file watcher emitting theme-changed events**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-07T09:00:12Z
- **Completed:** 2026-04-07T09:02:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ThemeConfig/ChromeTheme/TerminalTheme structs with full Solarized Dark ANSI palette defaults
- load_theme Tauri command that auto-creates ~/.config/efxmux/theme.json on first launch
- File watcher on config directory with 200ms debounce, JSON validation before event emission
- Graceful error handling: invalid JSON logs warning, returns defaults, never crashes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create theme types and load/save logic** - `8bbfb69` (feat)
2. **Task 2: Create theme file watcher with debounced Tauri event emission** - `70fe9b3` (feat)

## Files Created/Modified
- `src-tauri/src/theme/mod.rs` - Theme module root declaring types and watcher submodules
- `src-tauri/src/theme/types.rs` - ThemeConfig struct with Solarized Dark defaults, load_or_create_theme, load_theme command
- `src-tauri/src/theme/watcher.rs` - File watcher using notify-debouncer-mini, emits theme-changed Tauri events
- `src-tauri/Cargo.toml` - Added notify 8.2 and notify-debouncer-mini 0.7 dependencies
- `src-tauri/src/lib.rs` - Added theme module, ensure_config_dir + start_theme_watcher in setup, load_theme in invoke_handler

## Decisions Made
- Watch parent directory (~/.config/efxmux/) instead of theme.json directly, because editors do atomic saves via delete+rename which removes file-level watches
- Used serde(default) on every struct field so users can provide partial theme.json files that merge over Solarized Dark defaults
- Emit serde_json::Value as the theme-changed event payload rather than ThemeConfig, giving the JS frontend direct access to the raw JSON object

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- load_theme command ready for JS frontend to call on startup (Plan 03-02)
- theme-changed event ready for JS listener to apply CSS vars + xterm.js theme (Plan 03-02)
- Config directory and theme.json auto-creation tested via cargo build

---
## Self-Check: PASSED

- All 3 created files exist on disk
- Commit 8bbfb69 (Task 1) verified in git log
- Commit 70fe9b3 (Task 2) verified in git log
- cargo build succeeds with only pre-existing warnings

---
*Phase: 03-terminal-theming*
*Completed: 2026-04-07*
