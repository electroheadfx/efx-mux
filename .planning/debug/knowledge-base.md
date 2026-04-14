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

## shift-enter-newline — Shift+Enter submits Claude Code prompt instead of inserting newline
- **Date:** 2026-04-14
- **Error patterns:** shift+enter, newline, submits, prompt, sessionName, undefined, send_literal_sequence, CSI u, kitty, tmux send-keys, xterm, key handler
- **Root cause:** sessionName was undefined in the attachCustomKeyEventHandler closure for terminals created via restoreTabs, restartTabSession, and the right-panel bash terminal. These three createTerminal call sites omitted sessionName. Since restoreTabs is the normal startup path, every terminal after app restart had sessionName=undefined. The Shift+Enter handler detected the empty sessionName and bailed out, never calling invoke('send_literal_sequence'), so the CSI u sequence (\x1b[13;2u) was never sent to Claude Code. Additionally, the write_pty path through the PTY master cannot deliver CSI u through tmux when extended-keys=off — tmux eats the sequence. The correct delivery path is tmux send-keys -l, which sends literal bytes directly to the pane stdin bypassing tmux's key parser.
- **Fix:** Added sessionName to all three missing createTerminal call sites in terminal-tabs.tsx (restoreTabs, restartTabSession) and right-panel.tsx (bash terminal). For restartTabSession, moved newSessionName computation above the createTerminal call so it is available to pass in. Also added a new Rust Tauri command send_literal_sequence (pty.rs, lib.rs) that calls tmux send-keys -l, and wired the Shift+Enter handler in terminal-manager.ts to intercept Shift+Enter, call invoke('send_literal_sequence') with \x1b[13;2u, and return false to suppress the default \r.
- **Files changed:** src-tauri/src/terminal/pty.rs, src-tauri/src/lib.rs, src/terminal/terminal-manager.ts, src/components/terminal-tabs.tsx, src/components/right-panel.tsx
---

## claude-tui-fullscreen — Claude Code TUI shows “tmux detected” instead of fullscreen alternate-screen mode on session restore
- **Date:** 2026-04-14
- **Error patterns:** tmux detected, fullscreen, alternate screen, TUI, CLAUDE_CODE_NO_FLICKER, restore, reattach, send-keys, resize, zero cols, SIGWINCH, Ink, scrollback
- **Root cause:** Three cooperating bugs: (1) tmux send-keys C-l was injected into the live Ink TUI before the new PTY client attached, causing Ink to redraw at stale dimensions and fall back to inline mode. (2) ResizeObserver for a hidden tab container fired during another tab’s nextFrame, calling fitAddon.fit() on a display:none element and sending a zero-size SIGWINCH. (3) CLAUDE_CODE_NO_FLICKER=1 was absent from the tmux session environment — cmd.env() only affects the tmux client process, not the server-spawned shell; additionally tmux new-session -A silently ignores the initial-command argument when the session already exists, so existing sessions retained stale env from before the fix.
- **Fix:** (1) Removed send-keys C-l from session_exists block in spawn_terminal (pty.rs). (2) Added display:none guard in attachResizeHandler (resize-handler.ts). (3) Agent tabs now kill the existing tmux session before new-session so the inline export of CLAUDE_CODE_NO_FLICKER=1 and related vars in the shell wrapper format! string reaches claude on fresh session creation.
- **Files changed:** src-tauri/src/terminal/pty.rs, src/terminal/resize-handler.ts, src/components/terminal-tabs.tsx
---
