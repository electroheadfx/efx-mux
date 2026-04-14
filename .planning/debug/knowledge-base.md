# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## paste-truncation — PTY spawned at 80 cols before browser layout causes paste wrapping at wrong column
- **Date:** 2026-04-14
- **Error patterns:** paste, truncation, wrapping, cols, xterm, fitAddon, terminal width, 80 columns, tmux wrap
- **Root cause:** `fitAddon.fit()` is called before the container element has been laid out by the browser. `terminal.cols` is 80 (xterm.js default) at spawn time. The PTY and tmux session are opened at 80 columns. The ResizeObserver eventually corrects xterm.js dimensions via `resize_pty` IPC, but any paste during the interim window is echoed by tmux at 80 columns, causing text to wrap mid-word at an unexpected position inside a wider terminal display.
- **Fix:** Added `nextFrame()` helper (requestAnimationFrame wrapped in a Promise) to terminal-tabs.tsx. Inserted `await nextFrame(); fitAddon.fit()` before every `connectPty()` call across all four spawn paths: `createNewTab`, `initFirstTab`, `restoreTabs`, and `restartTabSession`. For `createNewTab`, the tab is shown via `switchToTab` first so the container is visible before measurement. For `restoreTabs`, containers are left visible during measurement then hidden after fit.
- **Files changed:** src/components/terminal-tabs.tsx
---
