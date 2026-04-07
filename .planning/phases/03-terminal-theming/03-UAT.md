---
status: diagnosed
phase: 03-terminal-theming
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md]
started: 2026-04-07T10:00:00Z
updated: 2026-04-07T10:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Solarized Dark Theme on Launch
expected: App launches with Solarized Dark colors: dark blue-gray background (#282d3a), blue accent (#258ad1). Terminal shows proper Solarized ANSI colors — not the old forest green palette.
result: pass

### 2. Auto-creation of theme.json
expected: Delete ~/.config/efxmux/theme.json (if it exists), relaunch the app. The file is recreated automatically with Solarized Dark defaults. App loads normally with correct colors.
result: pass

### 3. Theme Hot-Reload
expected: While the app is running, edit ~/.config/efxmux/theme.json (e.g., change a color value). Save the file. Terminal and chrome colors update live within ~200ms without restarting the app.
result: pass

### 4. Dark/Light Mode Toggle
expected: Toggle between dark and light mode. Chrome colors switch to Solarized Light values. Preference persists across page reloads (stored in localStorage).
result: issue
reported: "I change the OS theme to day mode from dark mode, the app stay on dark mode. In the app I have no dark/day mode toggle"
severity: major

### 5. Terminal Accepts Theme Colors
expected: Terminal text, background, and cursor use Solarized Dark palette from the theme — not hardcoded values. Colors match the theme.json configuration.
result: pass

### 6. iTerm2 Theme Import
expected: Import an iTerm2 JSON profile via the import_iterm2_theme command. Terminal and chrome colors update to match the imported profile. Existing theme.json is backed up to theme.json.bak before overwrite.
result: blocked
blocked_by: prior-phase
reason: "No UI to trigger import — Tauri command exists but file picker is Phase 8 (Settings UI)"

## Summary

total: 6
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "Toggle between dark and light mode. Chrome colors switch to Solarized Light values. Preference persists across page reloads."
  status: failed
  reason: "User reported: I change the OS theme to day mode from dark mode, the app stay on dark mode. In the app I have no dark/day mode toggle"
  severity: major
  test: 4
  root_cause: "toggleThemeMode() exists in theme-manager.js but is never called — no UI button or keyboard shortcut wired. No matchMedia('prefers-color-scheme') listener to detect OS theme changes."
  artifacts:
    - path: "src/theme/theme-manager.js"
      issue: "toggleThemeMode() exported but never invoked; no OS theme listener"
    - path: "src/main.js"
      issue: "Does not wire toggleThemeMode or add OS theme change listener"
  missing:
    - "Add matchMedia('(prefers-color-scheme: dark)') listener to auto-follow OS theme"
    - "Wire toggleThemeMode() to a UI element or keyboard shortcut"
