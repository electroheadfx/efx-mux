---
quick_id: 260407-di0
description: Fix phase 2 issues - LOW watermark hysteresis, terminal padding, key repeat, word navigation, line cursor, scrollbar
date: 2026-04-07
status: complete
commits:
  - hash: 9996005
    message: "fix(quick-260407-di0): add LOW watermark hysteresis to PTY flow control"
  - hash: 62c653c
    message: "fix(quick-260407-di0): terminal UX polish - cursor, scrollbar, key nav, padding"
---

# Quick Task 260407-di0: Phase 2 Fixes

## One-Liner

Added LOW watermark hysteresis (100KB resume threshold) to PTY flow control and polished terminal UX with bar cursor, visible scrollbar, word/line navigation, and 4px padding.

## Changes

### Task 1: LOW Watermark Hysteresis (pty.rs)
- Added `FLOW_LOW_WATERMARK` constant at 100,000 bytes
- Introduced `paused` boolean state for proper hysteresis
- Read loop now pauses at 400KB (HIGH) and only resumes when unacked drops below 100KB (LOW)
- Prevents rapid pause/resume oscillation at the boundary during sustained AI output

### Task 2: Terminal UX Polish
- **Cursor style:** Changed from `block` to `bar` (line cursor)
- **Scrollbar:** Added webkit-scrollbar CSS on `.xterm-viewport` with theme-aware colors
- **Word navigation:** `Alt+Left/Right` sends ESC b/f for word movement
- **Line navigation:** `Cmd+Left/Right` sends Home/End for line start/end
- **Padding:** 4px padding on `.terminal-area` container
- **Key repeat:** Custom handler returns `true` for unhandled keys, preserving native browser key repeat

## Files Modified
- `src-tauri/src/terminal/pty.rs` -- flow control hysteresis
- `src/terminal/terminal-manager.js` -- cursor, key handlers, overview ruler
- `src/styles/layout.css` -- padding, scrollbar styling
