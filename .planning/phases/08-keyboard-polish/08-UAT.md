---
status: complete
phase: 08-keyboard-polish
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md, 08-08-SUMMARY.md]
started: 2026-04-10T09:00:00Z
updated: 2026-04-10T09:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Efxmux instance. Start the app fresh. App boots without errors, main window appears, terminal loads.
result: pass

### 2. Shortcut Cheatsheet Overlay
expected: Press Ctrl+? (or Ctrl+/ on AZERTY). A cheatsheet overlay appears showing all 9+ app shortcuts grouped by section. Pressing Escape or clicking backdrop dismisses it.
result: pass

### 3. Create New Tab (Ctrl+T)
expected: Press Ctrl+T. A new tab appears in the tab bar. The new tab opens a plain shell session (not an agent like Claude Code). Tab bar shows both tabs.
result: pass

### 4. Close Active Tab (Ctrl+W)
expected: With multiple tabs open, press Ctrl+W. The active tab closes and focus moves to another tab. If it's the last tab, behavior is graceful (no crash).
result: pass

### 5. Cycle Tabs (Ctrl+Tab)
expected: With 2+ tabs open, press Ctrl+Tab. Focus cycles to the next tab. The terminal content switches to the other tab's session.
result: pass

### 6. Cmd+W Closes Tab Not App
expected: Press Cmd+W (macOS). The active tab closes instead of quitting the entire application.
result: pass

### 7. Crash/Exit Overlay
expected: In a tab, run `exit` to end the shell. An inline overlay appears showing "Session ended" with a green status dot. The overlay includes a Restart button.
result: pass

### 8. Crash Overlay Restart
expected: After seeing the exit overlay, click Restart. A fresh shell session starts in the same tab, overlay disappears.
result: pass

### 9. First-Run Wizard
expected: Delete state/projects so the app thinks it's a first run. Relaunch. A 5-step wizard appears (Welcome, Project, Agent, Theme, Server & GSD). Each step is skippable. Closing via X applies defaults.
result: pass

### 10. Fuzzy Search (Ctrl+P)
expected: Press Ctrl+P. The fuzzy search overlay opens. Pressing Escape closes it.
result: pass

### 11. Preferences Panel (Ctrl+,)
expected: Press Ctrl+, (or Cmd+,). A preferences overlay appears showing current project name, path, and agent. Theme toggle button works. Edit Project button opens the project modal.
result: pass

### 12. Tab Persistence Across Restart
expected: Open 2+ tabs. Quit and relaunch the app. Tabs are restored from the previous session (same count, first tab reconnects to agent).
result: pass

### 13. Terminal Passthrough
expected: In a terminal tab, Ctrl+C/D/Z/L all work as expected (interrupt, EOF, suspend, clear). These are not intercepted by app shortcuts.
result: pass

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
