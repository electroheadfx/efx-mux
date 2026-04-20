---
status: complete
---

# Quick Task 260408-rco: UI fixes round 2 - Summary

## Changes

### Task 1: Fix terminal mouse scroll regression and white flash
- **terminal-manager.ts**: Added `attachCustomWheelEventHandler` after `terminal.open()` — intercepts wheel events and calls `terminal.scrollLines()` directly, returning `false` to prevent xterm.js from converting wheel to arrow keys (tmux alternate screen buffer issue).
- **index.html**: Added `style="background-color: #282d3a; color: #92a0a0;"` to `<body>` tag to eliminate white flash before Vite loads CSS.

### Task 2: Fix Bash terminal theme mismatch and enable hot-reload
- **theme-manager.ts**: Added `getTheme()` export returning full `ThemeData | null` (terminal colors + chrome font/fontSize).
- **right-panel.tsx**: Imported `getTheme` and `registerTerminal` from theme-manager. Bash terminal now receives same theme colors, font, and fontSize as main terminal. Registered for hot-reload updates.

## Commits
- `5697122` fix(260408-rco): fix terminal mouse scroll regression and white flash on startup
- `cd00f6e` fix(260408-rco): fix bash terminal theme mismatch and enable hot-reload
