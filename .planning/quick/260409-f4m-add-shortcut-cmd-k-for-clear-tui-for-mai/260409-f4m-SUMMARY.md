# Quick Task 260409-f4m: Add Cmd+K shortcut to clear terminal scrollback

## What Changed

- **src/terminal/terminal-manager.ts**: Added Cmd+K handler inside `attachCustomKeyEventHandler` that calls `terminal.clear()` to clear scrollback buffer for both main and sider terminals.

## Commits

- `bebeb2f`: feat(260409-f4m): add Cmd+K shortcut to clear terminal scrollback

## Result

Both the main terminal and the sider (right-panel bash) terminal now respond to Cmd+K by clearing their scrollback. Since both terminals are created via `createTerminal()`, a single handler addition covers both.
