---
phase: 03-terminal-theming
fixed_at: 2026-04-07T19:05:00Z
review_path: .planning/phases/03-terminal-theming/03-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-04-07T19:05:00Z
**Source review:** .planning/phases/03-terminal-theming/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: `import_iterm2_theme` accepts unsanitized file path from frontend

**Files modified:** `src-tauri/src/theme/iterm2.rs`
**Commit:** 243f419
**Applied fix:** Added path validation before `fs::read_to_string`: (1) must be absolute path, (2) must have `.json` or `.itermcolors` extension, (3) symlinks resolved via `canonicalize()` to prevent traversal. The function now uses the canonical path for file reading.

### WR-01: `config_dir()` silently uses empty string when HOME is unset

**Files modified:** `src-tauri/src/theme/types.rs`
**Commit:** 243f419
**Applied fix:** Replaced `unwrap_or_default()` with `ok().filter(|h| !h.is_empty()).unwrap_or_else(...)` that emits a warning and falls back to `/tmp/efxmux-fallback` when HOME is unset or empty.

### WR-02: Cmd+Left/Right sends wrong escape sequences for shell line navigation

**Files modified:** `src/terminal/terminal-manager.js`
**Commit:** 243f419
**Applied fix:** Changed Cmd+Left from `\x1b[H` (CSI H = cursor to screen origin) to `\x01` (Ctrl+A = beginning of line), and Cmd+Right from `\x1b[F` (CSI F = cursor previous line) to `\x05` (Ctrl+E = end of line).

### WR-03: OS theme change listener unconditionally overrides user's manual mode choice

**Files modified:** `src/theme/theme-manager.js`
**Commit:** 243f419
**Applied fix:** Added `efxmux:theme-manual` localStorage flag. The OS change listener now checks this flag and only follows OS preference when the user has not manually toggled. `toggleThemeMode()` now sets the manual flag before switching.

---

_Fixed: 2026-04-07T19:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
