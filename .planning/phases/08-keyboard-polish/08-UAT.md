---
status: complete
phase: 08-keyboard-polish
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
  - 08-03-SUMMARY.md
  - 08-04-SUMMARY.md
started: 2026-04-09T18:30:00Z
updated: 2026-04-09T18:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cheatsheet Overlay (Ctrl+?)
expected: Press Ctrl+? (or Ctrl+Shift+/ on AZERTY). A cheatsheet overlay appears showing all 9 app keyboard shortcuts grouped by section (Terminal, Tabs, Search, General). Press Escape or click outside to dismiss.
result: pass

### 2. Terminal Passthrough (Ctrl+C/D/Z/L/R)
expected: In the terminal, Ctrl+C interrupts the current process (SIGINT), Ctrl+D sends EOF, Ctrl+Z suspends the job (SIGTSTP), Ctrl+L clears the screen -- all behave as expected in a real terminal, not intercepted by the app.
result: pass

### 3. Create New Tab (Ctrl+T)
expected: Press Ctrl+T. A new terminal tab appears in the tab bar, becomes active, and a fresh tmux session starts in that tab. The tab count increments.
result: issue
reported: "After the third terminal tab, it becomes a Claude session instead of a plain terminal. Also, when quitting the app, new terminal session tabs are not stored/restored."
severity: major

### 4. Close Active Tab (Ctrl+W)
expected: With multiple tabs open, press Ctrl+W. The active tab closes, the tab bar updates, and the adjacent tab becomes active. If only one tab exists, nothing happens. Cmd+W should also close the tab (not quit the app) when multiple tabs are present.
result: pass

### 5. Cycle Tabs (Ctrl+Tab)
expected: With multiple tabs open, press Ctrl+Tab. The next tab becomes active. Cycling wraps from last tab to first tab. After switching, terminal input works normally.
result: issue
reported: "When switching tabs with Ctrl+Tab, the terminal input becomes invisible and unresponsive. Cannot type CLI commands in the switched-to tab."
severity: major

### 6. Tab Persistence Across Restart
expected: Create 2+ tabs, do some work in each, then restart the app. The same tabs reappear with their sessions restored (or fresh sessions if tmux state was lost).
result: issue
reported: "New terminal session tabs are not stored/restored after app quit."
severity: major

### 7. Normal Exit Overlay
expected: Run a command that exits cleanly (e.g., exit, Ctrl+D). An overlay appears on that tab showing a green status dot and "Session ended" message. A Restart button is visible.
result: pass

### 8. Crash Overlay (Non-Zero Exit)
expected: Run a command that exits with a non-zero code (e.g., kill the process). An overlay appears with a red status dot, "Process crashed" message, and the exit code displayed. A Restart button is visible.
result: issue
reported: "tmux pane shows 'Pane is dead' with status 0 after shell exits. Restart button does not work - app remains blocked in dead state even after quit and relaunch."
severity: blocker

### 9. First-Run Wizard Appears
expected: On a fresh project (no state.json), the app launches and the first-run wizard appears with step 1: Welcome. The wizard cannot be bypassed by pressing Escape.
result: pass

### 10. Wizard Steps Are Skippable
expected: At each wizard step (Project, Agent, Theme, Server+GSD), a Skip button is visible. Clicking Skip advances to the next step with sensible defaults applied. After completing wizard, user lands in the main terminal view.
result: issue
reported: "After completing wizard (even with a valid project setup), user is shown the Add Project modal instead of the main terminal view."
severity: major

### 11. Wizard X Button Applies Defaults
expected: Clicking the X button (top-left or top-right) closes the wizard and applies defaults to all remaining steps (/tmp as path, "default" as project name, bash as agent, no server). Also, completing the wizard with valid project settings should persist those settings.
result: issue
reported: "When quitting the app after wizard setup and re-running, the app goes to /tmp default project instead of the project added in the wizard."
severity: major

### 12. Agent Selection
expected: In the Agent step, three cards are shown: Claude Code, OpenCode, Plain Shell. Clicking one selects it (visual highlight). Selection is remembered.
result: pass

### 13. Theme Import
expected: In the Theme step, a "Browse" button opens a native file picker. Selecting a .json or .itermcolors file imports the theme. A confirmation or preview is shown.
result: pass

### 14. Ctrl+P Opens Fuzzy Search
expected: Press Ctrl+P. The fuzzy search overlay opens (or an existing one gains focus). The search input is auto-focused and ready for typing.
result: pass

### 15. Ctrl+, Opens Preferences
expected: Press Ctrl+, (or Cmd+, on macOS). A preferences/settings panel opens showing project settings (server command, agent selection, theme). The panel can be dismissed with Escape.
result: issue
reported: "Ctrl+, shortcut does not work."
severity: major

## Summary

total: 15
passed: 8
issues: 8
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After the third terminal tab, it becomes a Claude session instead of a plain terminal"
  status: failed
  reason: "User reported: After the third terminal tab is created, it becomes a Claude session instead of a plain terminal. Also when quitting the app, new terminal session tabs are not stored/restored."
  severity: major
  test: 3

- truth: "Cmd+W closes the active tab when multiple tabs are present (not the app)"
  status: failed
  reason: "User reported: Cmd+W closes the app without warning when it should close the active tab like Ctrl+W does."
  severity: major
  test: 4

- truth: "Tab switching with Ctrl+Tab preserves terminal input functionality"
  status: failed
  reason: "User reported: When switching tabs with Ctrl+Tab, the terminal input becomes invisible and unresponsive. Cannot type CLI commands in the switched-to tab."
  severity: major
  test: 5

- truth: "Terminal tabs are persisted across app restart"
  status: failed
  reason: "User reported: New terminal session tabs are not stored/restored after app quit."
  severity: major
  test: 6

- truth: "Crash overlay shows red status dot, exit code, and working Restart button"
  status: failed
  reason: "tmux pane shows 'Pane is dead' with status 0. Restart button does not work - app remains blocked in dead state even after quit and relaunch."
  severity: blocker
  test: 8

- truth: "After completing wizard, user lands in the main terminal view"
  status: failed
  reason: "User reported: After completing wizard (even with a valid project setup), user is shown the Add Project modal instead of the main terminal view."
  severity: major
  test: 10

- truth: "Wizard project settings are persisted and restored after app restart"
  status: failed
  reason: "User reported: When quitting the app after wizard setup and re-running, the app goes to /tmp default project instead of the project added in the wizard."
  severity: major
  test: 11

- truth: "Ctrl+, opens preferences/settings panel"
  status: failed
  reason: "User reported: Ctrl+, shortcut does not work."
  severity: major
  test: 15
