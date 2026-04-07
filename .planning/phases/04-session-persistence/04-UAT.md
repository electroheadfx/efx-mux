---
status: diagnosed
phase: 04-session-persistence
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-04-07T13:00:00Z
updated: 2026-04-07T13:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running Efxmux instance. Start the app fresh. The app boots without errors, the terminal panel loads, and a tmux session attaches or creates successfully.
result: pass

### 2. State File Creation
expected: After launching the app, a state.json file exists in the Efxmux config directory (~/.config/efxmux/ or equivalent). You can check via terminal: ls ~/.config/efxmux/state.json
result: pass

### 3. Layout Persistence (Panel Ratios)
expected: Drag the panel dividers to resize panels to non-default ratios. Close the app. Reopen it. The panel ratios should be restored to where you left them — not reset to defaults.
result: pass

### 4. Theme Mode Persistence
expected: Toggle the theme mode (e.g., switch between light/dark or change Solarized variant). Close the app. Reopen it. The theme mode you selected should still be active.
result: issue
reported: "Theme can be toggled with ctrl+shift+t but the choice is not saved across restarts. Also OS theme changes do not trigger theme changes in the app."
severity: major

### 5. Session Name Persistence
expected: The tmux session name should be read from state.json (not hardcoded). If you previously had a session, the app should reattach to it on startup.
result: pass

### 6. Dead Tmux Session Recovery
expected: Kill the tmux session externally (tmux kill-session -t <name>). Then reopen or refocus the app. The app should detect the dead session, log a console warning, and automatically create a fresh tmux session — not crash or show a blank terminal.
result: pass

### 7. Close Handler Saves State
expected: Make a visible change (resize a panel). Close the app via the window close button (not force-quit). Reopen. The change should be persisted — confirming the Rust CloseRequested handler saved state on exit.
result: pass

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Theme mode persisted across app restarts and OS theme changes reflected in app"
  status: failed
  reason: "User reported: Theme can be toggled with ctrl+shift+t but the choice is not saved across restarts. Also OS theme changes do not trigger theme changes in the app."
  severity: major
  test: 4
  root_cause: "Two issues: (1) initTheme() calls applyTheme() which sets dark inline CSS vars unconditionally — never calls setThemeMode() so light mode CSS clearing never happens on restore. (2) toggleThemeMode() sets localStorage efxmux:theme-manual=true which is never cleared, permanently blocking the OS prefers-color-scheme listener."
  artifacts:
    - path: "src/theme/theme-manager.js"
      issue: "initTheme() does not call setThemeMode() after applyTheme(), light mode restore broken"
    - path: "src/theme/theme-manager.js"
      issue: "localStorage efxmux:theme-manual flag write-once, never cleared, blocks OS theme listener permanently"
  missing:
    - "Call setThemeMode(savedMode) in initTheme() after applyTheme() so light mode inline var clearing applies on startup"
    - "Replace persistent localStorage theme-manual flag with session-scoped variable or clear it on startup"
  debug_session: ""
