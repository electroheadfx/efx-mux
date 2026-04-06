---
status: complete
phase: 01-scaffold-entitlements
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md]
started: 2026-04-06T13:30:00Z
updated: 2026-04-06T13:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `cargo tauri dev` from scratch. The app window opens at ~1400x900 with no Rust panics or JS console errors. The 3-zone layout renders.
result: pass

### 2. Forest-Green Theme and FiraCode Font
expected: The app has a dark background with forest-green accent colors. Text renders in FiraCode monospace. The overall aesthetic is a dark terminal-style theme, not default white/gray.
result: pass
note: Theme sourced from iTerm2 colors (RESEARCH/iterm-theme.json), not forest-green as originally planned.

### 3. Three-Zone Layout Visible
expected: Three distinct zones are visible: a narrow sidebar on the left, a large main panel in the center, and a right panel. Split handles (thin vertical bars) separate them.
result: pass
note: Main panel also includes a bottom pane for server control/logs.

### 4. Sidebar Toggle (Ctrl+B)
expected: Pressing Ctrl+B collapses the sidebar to a narrow icon strip. Pressing Ctrl+B again expands it back. The transition is smooth (CSS animation ~0.15s).
result: pass

### 5. Sidebar-Main Vertical Split Drag
expected: Dragging the vertical handle between sidebar and main panel resizes them proportionally. The cursor changes during drag and panels don't flicker.
result: pass

### 6. Main-Right Vertical Split Drag
expected: Dragging the vertical handle between main and right panel resizes them. Both panels adjust smoothly without content overlap.
result: pass

### 7. Right Panel Horizontal Split Drag
expected: Inside the right panel, dragging the horizontal handle resizes the two sub-panels (top/bottom) vertically.
result: pass

### 8. Split Ratios Persist Across Restart
expected: Drag any split handle to a new position. Quit and relaunch the app. The split ratios are restored to where you left them (localStorage persistence).
result: pass

### 9. macOS Edit Menu and Clipboard
expected: The menu bar shows an Edit menu with standard items (Cut, Copy, Paste, Select All, Undo, Redo). Cmd+C/V/X work for copying and pasting text within the webview.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
